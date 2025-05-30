import {
    NodeManager,
    DocNode,
    NodeConnection,
} from "./graph_objects.js"

export class SimulationParameter {
    nodeMinDist: number = 10

    repulsion: number = 7000

    spring: number = 5
    springDist: number = 600

    forceCap: number = 200
}

export class GpuSimulator {
    simParam: SimulationParameter = new SimulationParameter()

    async simulatePhysics(manager: NodeManager) {
        // TODO: not implemented
    }
}
