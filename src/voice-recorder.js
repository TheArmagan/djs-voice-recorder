"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceRecorder = void 0;
const voice_1 = require("@discordjs/voice");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const path_1 = require("path");
const file_helper_1 = require("./file-helper");
const wav_1 = require("wav");
const replay_readable_1 = require("./replay-readable");
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
class VoiceRecorder {
    constructor(options = {}) {
        var _a, _b, _c, _d;
        this.writeStreams = {};
        this.options = {
            maxUserRecordingLength: ((_a = options.maxUserRecordingLength) !== null && _a !== void 0 ? _a : 120) * 1024 * 1024,
            maxRecordTimeMs: ((_b = options.maxRecordTimeMs) !== null && _b !== void 0 ? _b : 10) * 60 * 1000,
            sampleRate: ((_c = options.sampleRate) !== null && _c !== void 0 ? _c : 16000),
            channelCount: ((_d = options.channelCount) !== null && _d !== void 0 ? _d : 2),
        };
        this.fileHelper = new file_helper_1.FileHelper(options.recordDirectory);
    }
    /**
     * Starts listening to a given voice connection
     * @param connection
     */
    startRecording(connection, userFilter = () => true) {
        const guildId = connection.joinConfig.guildId;
        if (!this.writeStreams[guildId]) {
            const listener = (userId) => {
                //check if already listening to user
                if (!this.writeStreams[guildId].userStreams[userId]) {
                    const out = new replay_readable_1.ReplayReadable(this.options.maxRecordTimeMs, this.options.sampleRate, this.options.channelCount, { highWaterMark: this.options.maxUserRecordingLength, length: this.options.maxUserRecordingLength });
                    const opusStream = connection.receiver.subscribe(userId, {
                        end: {
                            behavior: voice_1.EndBehaviorType.AfterSilence,
                            duration: this.options.maxRecordTimeMs,
                        },
                    });
                    opusStream.on('end', () => {
                        delete this.writeStreams[guildId].userStreams[userId];
                    });
                    opusStream.on('error', (error) => {
                        console.error(error, `Error while recording voice of user ${userId}`);
                        delete this.writeStreams[guildId].userStreams[userId];
                    });
                    opusStream.pipe(out);
                    this.writeStreams[guildId].userStreams[userId] = {
                        source: opusStream,
                        out
                    };
                }
            };
            let filteredListener = (userId) => {
                if (userFilter(userId))
                    listener(userId);
            };
            this.writeStreams[guildId] = {
                userStreams: {},
                listener: filteredListener
            };
            connection.receiver.speaking.on('start', filteredListener);
        }
    }
    /**
     * Stops recording for a given voice connection
     * @param connection
     */
    stopRecording(connection) {
        const guildId = connection.joinConfig.guildId;
        const serverStreams = this.writeStreams[guildId];
        connection.receiver.speaking.removeListener('start', serverStreams.listener);
        for (const userId in serverStreams.userStreams) {
            const userStream = serverStreams.userStreams[userId];
            userStream.source.destroy();
            userStream.out.destroy();
        }
        delete this.writeStreams[guildId];
    }
    /**
     * Saves last x minutes of the recording
     * @param guildId id of the guild/server where the recording should be fetched
     * @param exportType save file either as wav or ogg
     * @param minutes timeframe for the recording. X last minutes
     * @returns the path to the created file
     */
    getRecordedVoice(guildId, fileName, exportType = 'audio', minutes = 10) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.writeStreams[guildId]) {
                console.warn(`server with id ${guildId} does not have any streams`, 'Record voice');
                return;
            }
            const recordDurationMs = Math.min(Math.abs(minutes) * 60 * 1000, this.options.maxRecordTimeMs);
            const endTime = Date.now();
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                const minStartTime = this.getMinStartTime(guildId);
                if (minStartTime) {
                    const { command, createdFiles } = yield this.getFfmpegSpecs(this.writeStreams[guildId].userStreams, minStartTime, fileName, endTime, recordDurationMs);
                    if (createdFiles.length) {
                        const resultPath = (0, path_1.join)(this.fileHelper.baseDir, `${fileName}.wav`);
                        command
                            .on('end', () => __awaiter(this, void 0, void 0, function* () {
                            let path;
                            if (exportType === 'audio') {
                                path = resultPath;
                                yield this.fileHelper.deleteFilesByPath(createdFiles);
                            }
                            else {
                                const files = [resultPath, ...createdFiles];
                                path = yield this.toOGG(files, fileName);
                                yield this.fileHelper.deleteFilesByPath(files);
                            }
                            resolve(path);
                        }))
                            .on('error', reject)
                            .saveToFile(resultPath);
                    }
                    else {
                        resolve(undefined);
                    }
                }
                else {
                    resolve(undefined);
                }
            }));
        });
    }
    toOGG(files, fileName) {
        return new Promise((resolve, reject) => {
            let options = (0, fluent_ffmpeg_1.default)();
            const outputOptions = [];
            const filePath = (0, path_1.join)(this.fileHelper.baseDir, `${fileName}.ogg`);
            for (let i = 0; i < files.length; ++i) {
                options = options.addInput(files[i]);
                outputOptions.push(`-map ${i}`);
            }
            options
                .outputOptions(outputOptions)
                .on('end', () => {
                resolve(filePath);
            })
                .on('error', reject)
                .saveToFile(filePath);
        });
    }
    getMinStartTime(guildId) {
        let minStartTime;
        for (const userId in this.writeStreams[guildId].userStreams) {
            const startTime = this.writeStreams[guildId].userStreams[userId].out.startTime;
            if (!minStartTime || (startTime < minStartTime)) {
                minStartTime = startTime;
            }
        }
        return minStartTime;
    }
    getFfmpegSpecs(streams, minStartTime, fileName, endTime, recordDurationMs) {
        return __awaiter(this, void 0, void 0, function* () {
            const maxRecordTime = endTime - recordDurationMs;
            const startRecordTime = Math.max(minStartTime, maxRecordTime);
            // length of the result recording would be endTime - startRecordTime
            let ffmpegOptions = (0, fluent_ffmpeg_1.default)();
            let amixStrings = [];
            const createdFiles = [];
            for (const userId in streams) {
                const stream = streams[userId].out;
                const filePath = (0, path_1.join)(this.fileHelper.baseDir, `${fileName}-${userId}.wav`);
                try {
                    yield this.saveFile(stream, filePath, startRecordTime, endTime);
                    ffmpegOptions = ffmpegOptions.addInput(filePath);
                    amixStrings.push(`[${createdFiles.length}:a]`);
                    createdFiles.push(filePath);
                }
                catch (e) {
                    console.error(e, 'Error while saving user recording');
                }
            }
            return {
                command: ffmpegOptions.complexFilter([
                    {
                        filter: `amix=inputs=${createdFiles.length}[a]`,
                        inputs: amixStrings.join(''),
                    }
                ]).map('[a]'),
                createdFiles
            };
        });
    }
    saveFile(stream, filePath, startTime, endTime) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const writeStream = new wav_1.FileWriter(filePath, {
                    channels: this.options.channelCount,
                    sampleRate: this.options.sampleRate
                });
                const readStream = stream.rewind(startTime, endTime);
                readStream.pipe(writeStream);
                writeStream.on('done', () => {
                    resolve();
                });
                writeStream.on('error', (error) => {
                    console.error(error, 'Error while saving user recording');
                    reject(error);
                });
            });
        });
    }
}
exports.VoiceRecorder = VoiceRecorder;
