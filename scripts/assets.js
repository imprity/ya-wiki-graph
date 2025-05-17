var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export let circleImage = null;
export function loadAssets() {
    return __awaiter(this, void 0, void 0, function* () {
        const loadImage = (url) => __awaiter(this, void 0, void 0, function* () {
            const body = yield fetch(url);
            if (body.status !== 200) {
                throw new Error(`failed to fetch ${url}: ${body.statusText}`);
            }
            const blob = yield body.blob();
            return yield createImageBitmap(blob);
        });
        circleImage = yield loadImage('circle.png');
    });
}
