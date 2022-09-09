"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayReadable = void 0;
const stream_1 = require("stream");
const opus_1 = require("@discordjs/opus");
// adjusted version of https://github.com/scramjetorg/rereadable-stream
class ReplayReadable extends stream_1.Writable {
    // lifeTime in milliseconds
    constructor(lifeTime, sampleRate, numChannels, options) {
        var _a;
        const adjustedOptions = Object.assign({
            length: 1048576,
            highWaterMark: 32,
            dropInterval: 1e3
        }, options);
        super(adjustedOptions);
        this.numChannels = numChannels;
        this.sampleRate = sampleRate;
        this._encoder = new opus_1.OpusEncoder(this.sampleRate, this.numChannels);
        this.currentOffset = 0;
        this.chunkTimeMs = 20;
        this.chunkSize = (this.chunkTimeMs / 1000) * this.sampleRate * this.numChannels * Uint8Array.BYTES_PER_ELEMENT * 2; // 20ms per chunk; I don't know why times 2 but without it the time is not correct
        this._highWaterMark = (_a = adjustedOptions.highWaterMark) !== null && _a !== void 0 ? _a : 32;
        this._bufArrLength = adjustedOptions.length;
        this._bufArr = [];
        this.fadeOutInterval = setInterval(() => {
            const newDate = Date.now();
            let dropped;
            for (dropped = 0; dropped < this._bufArr.length && (newDate - this._bufArr[dropped][2]) > lifeTime; ++dropped) {
            }
            if (dropped) {
                this._bufArr.splice(0, dropped);
                this.emit('drop', dropped);
            }
        }, 5000); // check every 5 seconds if some chunks timed out
    }
    get startTime() {
        var _a, _b;
        return (_b = (_a = this._bufArr[0]) === null || _a === void 0 ? void 0 : _a[2]) !== null && _b !== void 0 ? _b : Date.now();
    }
    _destroy(error, callback) {
        clearInterval(this.fadeOutInterval);
        super._destroy(error, callback);
    }
    _write(chunk, encoding, callback) {
        var _a;
        // encoding is 'buffer'... whatever...
        const addTime = Date.now();
        chunk = this.decodeChunk(chunk); // always 1280 bytes; 40 ms or 20 ms for 16 kHz, 2 channels
        const startTimeOfChunk = this.getStartTimeOfChunk(chunk, addTime);
        const silentBuffers = this.getSilentBuffer(startTimeOfChunk);
        let endTimeBefore = (_a = this._bufArr[this._bufArr.length - 1]) === null || _a === void 0 ? void 0 : _a[3];
        for (const ch of silentBuffers) {
            // I sometimes had the issue that there was some noise. Probably related to missing bytes in a chunk.
            // That's why I chose to split the chunk more chunks with the size chunkSize.
            // Maybe can also be solved if we subtract (amountOfBytes - (amountOfBytes % chunkSize))
            this._bufArr.push([ch, encoding, endTimeBefore, Date.now()]);
            endTimeBefore += this.chunkTimeMs;
        }
        this._bufArr.push([chunk, encoding, startTimeOfChunk, Date.now()]);
        callback();
        this.emit('wrote');
    }
    rewind(startTime, stopTime) {
        const ret = new stream_1.Readable({
            highWaterMark: this._highWaterMark,
            read: () => {
                let delayAdded = false;
                for (let i = 0; i < this._bufArr.length; ++i) {
                    const [chunk, encoding, chunkStartTime] = this._bufArr[i];
                    if (chunkStartTime < startTime) { // skipTime
                        continue;
                    }
                    else if (!delayAdded) {
                        // add delay time till start time of user in order to sync all users
                        const delayTimeSec = (chunkStartTime - startTime) / 1000;
                        if (delayTimeSec > 0) {
                            const buffers = this.getSilentBuffer(delayTimeSec, false, true);
                            for (const buffer of buffers) {
                                ret.push(buffer, this._bufArr[0][1]);
                            }
                        }
                        delayAdded = true;
                    }
                    if (chunkStartTime > stopTime) { // read everything till stopTime. Recording could increase till the last user stream is saved.
                        break;
                    }
                    const resp = ret.push(chunk, encoding); // push to readable
                    if (!resp) { // until there's not willing to read
                        break;
                    }
                }
                ret.push(null);
            }
        });
        return ret;
    }
    getSilentBuffer(stopTime, isWriting = true, isSeconds = false) {
        const silentBytes = this.getSilentBytes(stopTime, isSeconds);
        const silentPerChunk = Math.floor(silentBytes / this.chunkSize);
        const buffers = [];
        for (let i = 0; i < silentPerChunk; ++i) {
            buffers.push(Buffer.alloc(this.chunkSize));
        }
        if (isWriting) {
            this.currentOffset += silentBytes % this.chunkSize;
            if (buffers.length) {
                for (; this.currentOffset >= this.chunkSize; this.currentOffset -= this.chunkSize) {
                    buffers.push(Buffer.alloc(this.chunkSize));
                }
            }
        }
        return buffers;
    }
    /**
     *
     * @param stopTime Either the stopTime in ms or the amount of seconds
     * @param isSeconds
     * @private
     */
    getSilentBytes(stopTime, isSeconds = false) {
        const silenceTimeSec = isSeconds ? stopTime : this.getSilentSeconds(stopTime);
        if (silenceTimeSec) {
            const totalSamples = silenceTimeSec * this.sampleRate;
            return totalSamples * this.numChannels * Uint8Array.BYTES_PER_ELEMENT * 2; // I don't know why 2, but without it, we only have half of the silent bytes needed
        }
        else {
            return 0;
        }
    }
    getSilentSeconds(stopTime) {
        const lastElement = this._bufArr[this._bufArr.length - 1];
        if (!lastElement) {
            return 0;
        }
        const endTimeBefore = lastElement[3];
        const silenceTimeSec = ((stopTime - endTimeBefore) / 1000) - 0.04; // tolerance 40ms
        return silenceTimeSec < 0 ? 0 : silenceTimeSec;
    }
    decodeChunk(chunk) {
        return this._encoder.decode(chunk);
    }
    getStartTimeOfChunk(chunk, addTime) {
        return addTime - this.getChunkTimeMs(chunk);
    }
    getChunkTimeMs(chunk) {
        const bytesPerSample = Uint8Array.BYTES_PER_ELEMENT;
        const totalSamples = chunk.byteLength / bytesPerSample / this.numChannels;
        return (totalSamples / this.sampleRate / 2) * 1000; // again, I don't know why 2
    }
}
exports.ReplayReadable = ReplayReadable;
