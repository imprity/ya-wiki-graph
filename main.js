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
(() => __awaiter(void 0, void 0, void 0, function* () {
    // we don't really have to rate limit ourself
    // but I think it's a good etiquette
    const RATE_LIMIT = 20; // rate / second
    let LAST_REQUEST_AT = 0;
    const makeRequestToWiki = (query) => __awaiter(void 0, void 0, void 0, function* () {
        const wait = (milliseconds) => {
            return new Promise(res => {
                setTimeout(() => {
                    res();
                }, milliseconds);
            });
        };
        let now = Date.now();
        if (now - LAST_REQUEST_AT < 1000 / RATE_LIMIT) {
            const toWait = 1000 / RATE_LIMIT - (now - LAST_REQUEST_AT);
            yield wait(toWait);
            now = Date.now();
        }
        LAST_REQUEST_AT = now;
        let link = 'https://en.wikipedia.org/w/api.php?';
        for (const key in query) {
            link = link + `&${key}=${query[key]}`;
        }
        const response = yield fetch(link);
        const json = yield response.json();
        return json;
    });
    const retrieveAllLiks = (title) => __awaiter(void 0, void 0, void 0, function* () {
        let results = [];
        let doContinue = false;
        let nextContinue = "";
        while (true) {
            let doBreak = false;
            const query = {
                "action": "query",
                "prop": "links",
                "titles": title,
                "format": "json",
                "pllimit": "max",
                //"plnamespace": "0",
                "origin": "*"
            };
            if (doContinue) {
                query["plcontinue"] = nextContinue;
            }
            const response = yield makeRequestToWiki(query);
            // TEST TEST TEST TEST TEST
            console.log(response);
            // TEST TEST TEST TEST TEST
            if (!("continue" in response)) {
                doBreak = true;
            }
            else {
                doContinue = true;
                nextContinue = response.continue.plcontinue;
            }
            for (const pageId in response.query.pages) {
                const page = response.query.pages[pageId];
                // TEST TEST TEST TEST TEST
                for (const link of page.links) {
                    console.log(link);
                }
                // TEST TEST TEST TEST TEST
                results = results.concat(page.links);
            }
            if (doBreak) {
                break;
            }
        }
        return results;
    });
    const results = yield retrieveAllLiks("Miss Meyers");
    console.log(results);
}))();
