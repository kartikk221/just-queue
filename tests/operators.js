function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt
        .toLocaleString([], { hour12: true, timeZone: 'America/New_York' })
        .replace(', ', ' ')
        .split(' ');
    timeStamp[1] += ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    console.log(`[${timeStamp}][${logger}] ${message}`);
}

function assert_log(group, target, assertion) {
    try {
        let result = assertion();
        if (result) {
            log(group, 'Verified ' + target);
        } else {
            throw new Error(
                'Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString()
            );
        }
    } catch (error) {
        console.log(error);
        throw new Error(
            'Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString()
        );
    }
}

function async_wait(delay = 0) {
    return new Promise((res, rej) => setTimeout(res, delay));
}

module.exports = {
    log,
    assert_log,
    async_wait,
};
