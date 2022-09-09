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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileHelper = void 0;
const path_1 = require("path");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
class FileHelper {
    constructor(directory) {
        this.baseDir = directory !== null && directory !== void 0 ? directory : (0, path_1.join)(__dirname, '/sounds');
        this.checkAndCreateFolderSystem();
    }
    checkAndCreateFolderSystem() {
        for (const folder of [this.baseDir]) {
            this.checkAndCreateFolder(folder);
        }
    }
    checkAndCreateFolder(folder) {
        if (!(0, fs_1.existsSync)(folder)) {
            (0, fs_1.mkdirSync)(folder);
        }
    }
    deleteFilesByPath(files) {
        return __awaiter(this, void 0, void 0, function* () {
            let status = true;
            for (const file of files) {
                const stat = yield this.deleteFile(file);
                status && (status = stat);
            }
            return status;
        });
    }
    deleteFile(path) {
        return __awaiter(this, void 0, void 0, function* () {
            let deleted = false;
            if ((0, fs_1.existsSync)(path)) {
                try {
                    yield (0, promises_1.unlink)(path);
                    deleted = true;
                }
                catch (e) {
                    console.error(e, { path });
                }
            }
            return deleted;
        });
    }
}
exports.FileHelper = FileHelper;
