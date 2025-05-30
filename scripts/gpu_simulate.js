var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class SimulationParameter {
    constructor() {
        this.nodeMinDist = 10;
        this.repulsion = 7000;
        this.spring = 5;
        this.springDist = 600;
        this.forceCap = 200;
    }
}
export class GpuSimulator {
    constructor() {
        this.simParam = new SimulationParameter();
    }
    simulatePhysics(manager) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: not implemented
        });
    }
}
