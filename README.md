# JustQueue: A Simple-To-Use Promise Based Queue For Concurrency & Throttle Limiting.

<div align="left">

[![NPM version](https://img.shields.io/npm/v/just-queue.svg?style=flat)](https://www.npmjs.com/package/just-queue)
[![NPM downloads](https://img.shields.io/npm/dm/just-queue.svg?style=flat)](https://www.npmjs.com/package/just-queue)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/kartikk221/just-queue.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/kartikk221/just-queue/context:javascript)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/just-queue)](https://github.com/kartikk221/just-queue/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/just-queue)](https://github.com/kartikk221/just-queue/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/just-queue)](https://github.com/kartikk221/just-queue/blob/master/LICENSE)

</div>

## Motivation
JustQueue aims to simplify the process of setting up local queues in which you may need to throttle or limit the concurrency of asynchronous operations. The most common use case would using JustQueue in front an outgoing third party API request that may have its own rate and concurrency limits. In this scenario, JustQueue can allow asynchronous calls to this API to be appropriately throttled without going over the specified limits.

Some of the prominent features implemented are:
- Promise Based Queue
- Asynchronous By Nature
- CPU & Memory Efficient
- Various Limiting Options

## Installation
JustQueue can be installed using node package manager (`npm`)
```
npm i just-queue
```

## Table Of Contents
- [JustQueue: A Simple-To-Use Promise Based Queue For Concurrency & Throttle Limiting.](#justqueue-a-simple-to-use-promise-based-queue-for-concurrency--throttle-limiting)
  - [Motivation](#motivation)
  - [Installation](#installation)
  - [Table Of Contents](#table-of-contents)
  - [Examples](#examples)
      - [Example: Concurrenly Limiting Queue To Third-Party API](#example-concurrenly-limiting-queue-to-third-party-api)
      - [Example: Throttle Limiting Queue To Third-Party API](#example-throttle-limiting-queue-to-third-party-api)
  - [JustQueue](#justqueue)
      - [JustQueue Constructor Options](#justqueue-constructor-options)
      - [JustQueue Instance Properties](#justqueue-instance-properties)
      - [JustQueue Instance Methods](#justqueue-instance-methods)
  - [License](#license)

## Examples
Below are various examples that make use of JustQueue.

#### Example: Concurrenly Limiting Queue To Third-Party API
```javascript
const JustQueue = new JustQueue({
    max_concurrent: 4
});

async function get_currency_data(){
    // Assume this function makes a POST request to a third-party API
    // that only allows 4 conncurrent requests to be made with your API key
}

async function throttled_get(){
    return JustQueue.queue(() => get_currency_data());
}

// We can now call this function more than 4 times but JustQueue will
// automatically ensure that no more than 4 maximum concurrent requests are made at any given time
throttled_get()
.then((data) => console.log('Got Currency Data!', data))
.catch((error) => console.log('Failed To Get Currency Data: ', error));
});
```

#### Example: Throttle Limiting Queue To Third-Party API
```javascript
const JustQueue = new JustQueue({
    throttle: {
        rate: 4,
        interval: 5000
    }
});

async function get_currency_data(){
    // Assume this function makes a POST request to a third-party API
    // that only allows 4 requests every 5 seconds with your API key.
}

async function throttled_get(){
    return JustQueue.queue(() => get_currency_data());
}

// We can now call this function more than 4 times but JustQueue will
// automatically ensure that no more than 4 requests are made every 5 seconds.
throttled_get()
.then((data) => console.log('Got Currency Data!', data))
.catch((error) => console.log('Failed To Get Currency Data: ', error));
});
```

## JustQueue
Below is a breakdown of the `JustQueue` object class generated while creating a new JustQueue instance.

#### JustQueue Constructor Options
* `max_concurrent` [`Number`]: Maximum number of operations to execute concurrently.
    * **Default**: `Infinity`
* `max_queued` [`Number`]: Maximum number of operations to have queued at any given time.
    * **Default**: `Infinity`
    * **Note:** The operation will reject with an `Error` that has the message `QUEUE_FULL`.
* `timeout` [`Number`]: Maximum amount of time in milliseconds after which a queued operation is aborted.
    * **Default**: `Infinity`
    * **Note:** The operation will reject with an `Error` that has the message `TIMED_OUT`.
* `throttle` [`Object`]: Throttle limiter options.
    * `rate` [`Number`]: Number of operations to execute in a throttle interval.
      * **Default:** `Infinity`
  * `interval` [`Number`]: Interval time in milliseconds to throttle operations.
      * **Default:** `Infinity` 

#### JustQueue Instance Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `active` | `Number` | Number of concurrently active operations. |
| `queued` | `Number` | Number of queued operations. |

#### JustQueue Instance Methods
* `queue(Function: operation)`: Queues an operation
    * **Returns** a `Promise`
    * **Note** `operation` must be `async` or return a `Promise`.
     * **Asynchronous Example:** `queue(async () => { /* Your Code Here */});`
     * **Promise Example:** `queue(() => new Promise((resolve, reject) => { /* Your Code Here */});`
## License
[MIT](./LICENSE)