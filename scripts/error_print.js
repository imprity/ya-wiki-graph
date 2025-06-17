import * as math from './math.js';
const errorPrintBox = document.getElementById('error-print-box');
class ErrorMsg {
    static getNewErrorMsgId() {
        const id = ErrorMsg.errorMsgIdMax + 1;
        ErrorMsg.errorMsgIdMax += 1;
        return id;
    }
    constructor(element, dummyElement) {
        this.createdAt = Date.now();
        this.element = element;
        this.dummyElement = dummyElement;
        this.id = ErrorMsg.getNewErrorMsgId();
    }
}
ErrorMsg.errorMsgIdMax = 0;
let errorMsgs = new Map();
let errorMsgsToRemove = new Map();
const MAX_ERROR_MSGS = 10;
const MIN_ERROR_MSGS = 3;
const ERROR_MSG_LIFESPAN = 2500;
function printMsg(str, isInfo) {
    if (errorPrintBox === null) {
        return;
    }
    if (errorMsgs.size > MAX_ERROR_MSGS) {
        const iter = errorMsgs.values();
        const first = iter.next().value;
        if (first !== undefined) {
            removeErrorMessage(first);
        }
    }
    const errorP = document.createElement('p');
    errorP.innerText = str;
    errorP.classList.add('error-message');
    errorP.classList.add('noselect');
    errorP.style.left = '-30px';
    errorP.style.bottom = '15px';
    errorPrintBox.appendChild(errorP);
    if (isInfo) {
        errorP.style.setProperty('--msg-text-color', 'var(--text-black)');
        errorP.style.setProperty('--msg-border-color', 'var(--grey)');
        errorP.style.setProperty('--msg-bg-color', 'var(--white)');
    }
    const dummyP = document.createElement('p');
    dummyP.innerText = str;
    dummyP.classList.add('error-message-dummy');
    dummyP.classList.add('noselect');
    errorPrintBox.appendChild(dummyP);
    const msg = new ErrorMsg(errorP, dummyP);
    errorMsgs.set(msg.id, msg);
}
export function printError(str) {
    printMsg(str, false);
}
export function printInfo(str) {
    printMsg(str, true);
}
function removeErrorMessage(toRemove) {
    errorMsgs.delete(toRemove.id);
    if (!errorMsgsToRemove.has(toRemove.id)) {
        errorMsgsToRemove.set(toRemove.id, toRemove);
        toRemove.dummyElement.remove();
        const rect = toRemove.element.getBoundingClientRect();
        const animDuration = 100;
        toRemove.element.animate([
            { transform: `translateX(0px)` },
            { transform: `translateX(${-(rect.x + rect.width) - 10}px)` },
        ], {
            duration: animDuration,
            fill: 'forwards',
            easing: 'ease-in'
        });
        setTimeout(() => {
            toRemove.element.remove();
            errorMsgsToRemove.delete(toRemove.id);
        }, animDuration + 10);
    }
}
export function updateErrorMsgs(deltaTime) {
    if (errorPrintBox === null) {
        return;
    }
    const now = Date.now();
    // remove error messages that are old
    {
        errorMsgs.forEach((msg, id, _) => {
            if (now - msg.createdAt > ERROR_MSG_LIFESPAN) {
                removeErrorMessage(msg);
            }
        });
    }
    const parentRect = errorPrintBox.getBoundingClientRect();
    // if there are too many error message and filling up the screen
    // try removeing some
    {
        const viewportHeight = document.documentElement.clientHeight;
        if (errorMsgs.size > MIN_ERROR_MSGS && parentRect.height > viewportHeight * 0.4) {
            const iter = errorMsgs.values();
            const first = iter.next().value;
            if (first !== undefined) {
                removeErrorMessage(first);
            }
        }
    }
    for (const msg of errorMsgs.values()) {
        const dummyRect = msg.dummyElement.getBoundingClientRect();
        const rect = msg.element.getBoundingClientRect();
        if (Math.abs(dummyRect.x - rect.x) < 0.001 &&
            Math.abs(dummyRect.y - rect.y) < 0.001 &&
            Math.abs(dummyRect.width - rect.width) < 0.001 &&
            Math.abs(dummyRect.height - rect.height) < 0.001) {
            continue;
        }
        dummyRect.x -= parentRect.x;
        dummyRect.y -= parentRect.y;
        rect.x -= parentRect.x;
        rect.y -= parentRect.y;
        let x = rect.x;
        let y = rect.y;
        // x = math.lerp(x, dummyRect.x, 0.1)
        // y = math.lerp(y, dummyRect.y, 0.1)
        x = math.expDecay(x, dummyRect.x, 9, deltaTime);
        y = math.expDecay(y, dummyRect.y, 9, deltaTime);
        msg.element.style.left = `${x}px`;
        msg.element.style.bottom = `${parentRect.height - y - rect.height}px`;
        msg.element.style.width = `${dummyRect.width}px`;
        msg.element.style.height = `${dummyRect.height}px`;
    }
}
