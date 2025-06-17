var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as util from "./util.js";
export let circleImage = null;
export let glowImage = null;
export let loadingCircleImage = null;
export function loadAssets() {
    return __awaiter(this, void 0, void 0, function* () {
        const loadImage = (url, cb) => __awaiter(this, void 0, void 0, function* () {
            const blob = yield util.fetchBlob(url);
            let result = yield createImageBitmap(blob);
            cb(result);
        });
        yield Promise.all([
            loadImage('assets/circle.png', (img) => { circleImage = img; }),
            loadImage('assets/glow.png', (img) => { glowImage = img; }),
            loadImage('assets/loading-circle.png', (img) => { loadingCircleImage = img; })
        ]);
    });
}
