const JustQueue = require('../index.js');
const { log, assert_log, async_wait } = require('./operators.js');
const TEST_DELAY = 100;
const TEST_TIMEOUT = TEST_DELAY * 4;
const TEST_VALUE = Math.random();
const TEST_ERROR_MSG = 'SOME_ERROR';

function some_operation(success = true, delay = 100) {
    return new Promise((resolve, reject) => {
        setTimeout(
            (s, rs, rj) => {
                if (s) {
                    rs(TEST_VALUE);
                } else {
                    rj(new Error(TEST_ERROR_MSG));
                }
            },
            delay,
            success,
            resolve,
            reject
        );
    });
}

const TEST_QUEUE = new JustQueue({
    max_concurrent: 1,
    max_queued: 2,
    timeout: TEST_TIMEOUT,
});

const THROTTLE_ITERATIONS = 4;
const THROTTLE_RATE = 2;
const THROTTLE_INTERVAL = 500;
const THROTTLED_QUEUE = new JustQueue({
    throttle: {
        rate: THROTTLE_RATE,
        interval: THROTTLE_INTERVAL,
    },
});

const group = 'QUEUE';
(async () => {
    log(group, 'Testing JustQueue Object...');

    // Assert initial queue values
    assert_log(group, 'Initial Values Test', () => {
        return TEST_QUEUE.active === 0 && TEST_QUEUE.queued === 0;
    });

    // Perform operation resolve & timing test to test proper execution
    let start_ts = Date.now();
    let value = await TEST_QUEUE.queue(() => some_operation(true, TEST_DELAY));
    assert_log(group, 'Operation Resolve & Timing Test', () => {
        return value === TEST_VALUE && Date.now() - start_ts > TEST_DELAY;
    });

    // Perform operation reject & timing test
    start_ts = Date.now();
    let error;
    try {
        await TEST_QUEUE.queue(() => some_operation(false, TEST_DELAY));
    } catch (e) {
        error = e;
    }
    assert_log(group, 'Operation Reject & Timing Test', () => {
        return error.message === TEST_ERROR_MSG && Date.now() - start_ts > TEST_DELAY;
    });

    // Perform concurrency throttle test
    let responses = [];
    for (let i = 0; i < 3; i++)
        TEST_QUEUE.queue(() => some_operation(true, TEST_DELAY)).then((val) => responses.push(val));

    // Check for metrics to ensure concurrency limiter is working properly
    assert_log(group, 'Queue Concurreny Limited Operation Metrics Test', () => {
        return TEST_QUEUE.active === 1 && TEST_QUEUE.queued === 2;
    });

    // Test for maximum queued operations limit
    TEST_QUEUE.queue(() => some_operation(true, TEST_DELAY)).catch((error) =>
        assert_log(group, 'Maximum Queued Operations Rejection Test', () => {
            return error.message === 'QUEUE_FULL';
        })
    );

    // Test for queued responses
    await async_wait(TEST_DELAY * 4);
    assert_log(group, 'Queue Responses & Concurreny Results Test', () => {
        return TEST_QUEUE.active === 0 && TEST_QUEUE.queued === 0 && responses.length === 3;
    });

    let timeout_error;
    TEST_QUEUE.queue(() => some_operation(true, TEST_TIMEOUT + TEST_DELAY));
    TEST_QUEUE.queue(() => some_operation(true, 0)).catch((error) => {
        // we won't handle this as this is just a spacing operation
        // to create two empty cursor spots in the queue store
        // for proper cursor increment test
    });

    // Perform queued operation timeout rejection test
    try {
        console.log(await TEST_QUEUE.queue(() => some_operation(true, TEST_DELAY)));
    } catch (error) {
        timeout_error = error;
    }
    assert_log(group, 'Queued Operation Timeout Rejection Test', () => {
        return timeout_error.message === 'TIMED_OUT';
    });

    // Perform proper cursor incrementation test
    start_ts = Date.now();
    value = await TEST_QUEUE.queue(() => some_operation(true, TEST_DELAY));
    assert_log(group, 'Proper Queue Cursor Incrementation Test', () => {
        return value === TEST_VALUE && Date.now() - start_ts > TEST_DELAY;
    });

    let promises = [];
    log(
        group,
        `Performing Throttled Queue Tests... [Expected To Take ~${
            THROTTLE_ITERATIONS * THROTTLE_INTERVAL
        }ms]`
    );

    let counter = 1;
    start_ts = Date.now();
    for (let i = 0; i < THROTTLE_ITERATIONS; i++) {
        for (let v = 0; v < THROTTLE_RATE; v++) {
            let current = counter;
            promises.push(THROTTLED_QUEUE.queue(() => some_operation(true, TEST_DELAY)));
            counter++;

            if (promises.length > THROTTLE_RATE) {
                assert_log(group, 'Throttled Queue Operations Metrics Test', () => {
                    let active = THROTTLED_QUEUE.active;
                    return (
                        THROTTLE_RATE === active &&
                        THROTTLED_QUEUE.queued === promises.length - active
                    );
                });
            } else {
                assert_log(group, 'Throttled Queue Operations Window Test', () => {
                    return THROTTLED_QUEUE.active === promises.length;
                });
            }
        }
    }

    await Promise.all(promises);
    assert_log(group, 'Throttled Queue Full Completion Timing Test', () => {
        return Date.now() - start_ts > (THROTTLE_ITERATIONS - 1) * THROTTLE_INTERVAL;
    });

    log(group, 'Finished Testing JustQueue Object!');
    process.exit();
})();
