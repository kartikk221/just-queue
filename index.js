const ERRORS = {
    timed_out: new Error('TIMED_OUT'),
    uncaught_error: new Error('UNCAUGHT_ERROR'),
    operation_reject: new Error('OPERATION_REJECT'),
    operation_invalid: new Error('OPERATION_INVALID'),
    queue_full: new Error('QUEUE_FULL'),
};

function fill_object(original, target) {
    Object.keys(target).forEach((key) => {
        if (typeof target[key] == 'object') {
            if (original[key] == undefined) original[key] = {};
            fill_object(original[key], target[key]);
        } else if (original[key] == null || typeof original[key] === typeof target[key]) {
            original[key] = target[key];
        }
    });

    return original;
}

class JustQueue {
    #cursor = -1;
    #id_counter = this.#cursor;
    #id_max = Number.MAX_SAFE_INTEGER;
    #store = {};
    #throttling = false;
    #metrics = {
        active: 0,
        queued: 0,
    };

    #options = {
        max_concurrent: Infinity,
        max_queued: Infinity,
        timeout: Infinity,
        throttle: {
            rate: Infinity,
            interval: Infinity,
        },
    };

    /**
     *
     * @param {Object} options JustQueue options
     * @param {Number} options.max_concurrent Maximum number of operations to perform concurrently
     * @param {Number} options.max_queued Maximum number of operations to have queued at any given time
     * @param {Number} options.timeout Number of milliseconds after which to timeout a queued operation
     * @param {Object} options.throttle Queue throttling options
     * @param {Number} options.throttle.rate Number of operations to perform in specified throttle interval
     * @param {Number} options.throttle.interval Throttle interval in milliseconds to perform operations in
     */
    constructor(options = this.#options) {
        // Fill self options object with user options
        fill_object(this.#options, options);

        // Determine whether instance should be throttling
        const { rate, interval } = this.#options.throttle;
        if (this._is_pfinite(rate) && this._is_pfinite(interval)) this.#throttling = true;
    }

    /**
     * Checks to see whether provided parameter value is a catchable promise.
     *
     * @param {Any} promise
     * @returns {Boolean}
     */
    _is_promise(promise) {
        return promise && typeof promise == 'object' && typeof promise.catch == 'function';
    }

    /**
     * Returns whether number is finite and greater than 0.
     *
     * @param {Number} number
     * @returns {Boolean}
     */
    _is_pfinite(number) {
        return isFinite(number) && number > 0;
    }

    /**
     * Generates and returns an incremented number identifier.
     *
     * @returns {Number}
     */
    _increment_id() {
        // Increment id counter and wrap once max limit is reached
        this.#id_counter++;
        if (this.#id_counter == this.#id_max) this.#id_counter = 0;
        return this.#id_counter;
    }

    _increment_cursor() {
        // Increment id counter and wrap once max limit is reached
        this.#cursor++;
        if (this.#cursor == this.#id_max) this.#cursor = 0;
        return this.#cursor;
    }

    /**
     * Queues an operation which is then resolved or rejected based on user operation or one of internal error codes.
     *
     * @param {Function} operation
     * @returns {Promise} Promise->operation[Promise]
     */
    queue(operation) {
        // Ensure operation is a function type
        if (typeof operation !== 'function')
            throw new Error('.queue(operation) -> operation must be a Function.');

        // Reject operation request if queue is full
        const { timeout, max_queued } = this.#options;
        if (this.#metrics.queued === max_queued) return Promise.reject(ERRORS.queue_full);

        // Create new passthrough promise and return for user to handle
        let reference = this;
        let index;
        let promise = new Promise((resolve, reject) => {
            // Create queue candidate with methods in store
            index = reference._increment_id();
            reference.#store[index] = {
                rs: resolve,
                rj: reject,
                o: operation,
            };

            // Bind setTimeout to instance if options.timeout is a valid finite milliseconds Number
            if (reference._is_pfinite(timeout))
                reference.#store[index].t = setTimeout(
                    (context, index) => {
                        // Decrement queued operations as this operation never exected
                        context.#metrics.queued--;
                        context._finish_operation(index, false, ERRORS.timed_out);
                    },
                    timeout,
                    reference,
                    index
                );

            // Increment queued operations and call _perform_work
            this.#metrics.queued++;
            this._perform_work();
        });

        promise.id = index;
        return promise;
    }

    #cycle_hits = 0;
    #cycle_close = Date.now();

    /**
     * Returns whether there should be a throttle delay.
     *
     * @returns {Number} Milliseconds Delay
     */
    _throttle() {
        // Do not throttle if throttling has not been enabled for instance
        if (this.#throttling === false) return 0;

        const { rate, interval } = this.#options.throttle;

        // Determine whether max hits have been reached while cycle has not ended.
        // Return difference in milliseconds till next cycle begin timestamp.
        let max_hits = this.#cycle_hits === rate;
        let in_cycle = this.#cycle_close > Date.now();
        if (max_hits && in_cycle) return this.#cycle_close - Date.now();

        // Reset cycle hits and reset cycle close timestamp once old cycle has expired
        if (this.#cycle_close < Date.now()) {
            this.#cycle_hits = 1;
            this.#cycle_close = Date.now() + interval;
        } else {
            // Increment cycle hits to exhaust max rate per cycle interval
            this.#cycle_hits++;
        }

        // Return 0ms as we have not exhausted hits in current cycle yet
        return 0;
    }

    /**
     * Instruction cycle method for queue. Retrieves an operation, executes operation and finishes operation.
     */
    _perform_work() {
        // Break perform work cycle if there are no more queued items to execute
        const { queued, active } = this.#metrics;
        if (queued < 1) return false;

        // Enforce concurrency limiter
        const { max_concurrent } = this.#options;
        if (active == max_concurrent) return false;

        // Enforce throttle limiter
        let throttle = this._throttle();
        if (throttle > 0) {
            // If concurrent operations have been flushed, wait till next fresh cycle
            if (active == 0) {
                // Delay next _perform_work execution by milliseconds till next cycle window (throttle)
                return setTimeout((c) => c._perform_work(), throttle, this);
            } else {
                // Break execution as concurrent operations have not flushed yet
                return false;
            }
        }

        // Increment cursor & Retrieve queue candidate
        this._increment_cursor();
        const index = this.#cursor;
        const candidate = this.#store[index];

        // break execution and queue _perform_work call in event loop as current candidate no longer exists (likely timed out)
        if (candidate == undefined) return setImmediate((context) => context._perform_work(), this);

        // Clear candidate timeout if one exists
        if (candidate.t) clearTimeout(candidate.t);

        // Update queue metrics to keep track of concurrent vs. queued operations
        this.#metrics.active++;
        this.#metrics.queued--;

        // Retrieve promise from candidate operation
        const promise = candidate.o();

        // Bind then/catch handlers to operation promise
        if (this._is_promise(promise)) {
            promise
                .then((payload) => this._finish_operation(index, true, payload))
                .catch((error) => this._finish_operation(index, false, error));
        } else {
            this._finish_operation(index, false, ERRORS.operation_invalid);
        }
    }

    /**
     * Resolves/Rejects a queued operation and cleans up any associated resources from queue/store.
     *
     * @param {Number} index
     * @param {Boolean} resolved
     * @param {Any} payload
     * @param {String} code
     */
    _finish_operation(index, resolved, payload) {
        // Decrement active operations count for concurrency limiter
        this.#metrics.active--;

        // Retrieve operation promise methods to complete user promise
        const { rs, rj } = this.#store[index];
        if (resolved === true) {
            rs(payload);
        } else {
            rj(payload);
        }

        // Cleanup queued candidate from store
        delete this.#store[index];

        // Call perform work to see if any more work needs to be done
        this._perform_work();
    }

    /* JustQueue Getters */

    /**
     * Number of concurrent operations in queue.
     */
    get active() {
        return this.#metrics.active;
    }

    /**
     * Number of queued operations in queue.
     */
    get queued() {
        return this.#metrics.queued;
    }
}

module.exports = JustQueue;
