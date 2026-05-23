import type { IXsd } from '../types'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import { SchemaWorker } from './SchemaWorker'

/** Schema registry — no editor reference. */
export class SchemaRegistry implements ISchemaRegistry {
    private readonly workers = new Map<string, ISchemaWorker>()

    constructor(private readonly monacoApi: IMonacoApi) {}

    set(xsd: IXsd): void {
        this.workers.set(xsd.path, SchemaWorker.create(xsd, this.monacoApi))
    }

    update(xsd: IXsd): void {
        this.workers.delete(xsd.path)
        this.set(xsd)
    }

    delete(path: string): boolean {
        return this.workers.delete(path)
    }

    get(path: string): ISchemaWorker | undefined {
        return this.workers.get(path)
    }

    has(path: string): boolean {
        return this.workers.has(path)
    }

    getNonStrict(path: string): ISchemaWorker | undefined {
        for (const worker of this.workers.values()) {
            if (worker.xsd.nonStrictPath && path.includes(worker.xsd.path)) {
                return worker
            }
        }
        return undefined
    }

    getAlwaysIncludedWorkers(rootTag: string | undefined): ISchemaWorker[] {
        const result: ISchemaWorker[] = []
        for (const worker of this.workers.values()) {
            if (worker.xsd.alwaysInclude) {
                result.push(worker)
            } else if (rootTag && worker.xsd.includeIfRootTag?.includes(rootTag)) {
                result.push(worker)
            }
        }
        return result
    }

    getXsdList(): IXsd[] {
        return [...this.workers.values()].map(w => w.xsd)
    }

    getAllWorkers(): ISchemaWorker[] {
        return [...this.workers.values()]
    }

    getWorkerForElement(elementName: string, parentName: string | null): ISchemaWorker | undefined {
        for (const worker of this.workers.values()) {
            if (parentName === null) {
                if (worker.getRootElements().some(n => n.name === elementName)) {
                    return worker
                }
            } else {
                if (worker.getSubElements(parentName).some(n => n.name === elementName)) {
                    return worker
                }
            }
        }
        return undefined
    }
}
