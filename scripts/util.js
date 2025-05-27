var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export function saveBlob(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
export function fetchBlob(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = yield fetch(url);
        if (body.status !== 200) {
            throw new Error(`failed to fetch ${url}: ${body.statusText}`);
        }
        return yield body.blob();
    });
}
export function calculateSum(a, b) {
    return (b - a + 1) * (a + b) / 2;
}
export function objHasMatchingKeys(obj, instance, forgiveMissingProperties) {
    const keys = Reflect.ownKeys(instance);
    for (const key of keys) {
        const instanceType = typeof instance[key];
        const objType = typeof obj[key];
        if (forgiveMissingProperties && objType === 'undefined') {
            continue;
        }
        if (instanceType !== objType) {
            return false;
        }
        if (instanceType == "object") {
            if (Array.isArray(instance[key])) {
                if (!Array.isArray(obj[key])) {
                    return false;
                }
            }
            else {
                if (!objHasMatchingKeys(instance[key], obj[key], forgiveMissingProperties)) {
                    return false;
                }
            }
        }
    }
    return true;
}
