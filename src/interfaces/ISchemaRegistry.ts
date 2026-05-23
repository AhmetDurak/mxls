import type { IXsd } from '../types'
import type { ISchemaWorker } from './ISchemaWorker'

/**
 * Schema registry contract.  Holds the set of registered XSD workers and
 * answers lookup queries.  No editor reference — the root tag is passed in
 * by EditorPlugin when needed.
 */
export interface ISchemaRegistry {
    /** Register or replace a schema. */
    set(xsd: IXsd): void

    /** Convenience: delete then re-set. */
    update(xsd: IXsd): void

    /** Remove a schema by path. Returns true if it existed. */
    delete(path: string): boolean

    /** Exact-path lookup. */
    get(path: string): ISchemaWorker | undefined

    has(path: string): boolean

    /**
     * Non-strict lookup: returns the first worker whose `xsd.nonStrictPath`
     * flag is set and whose `xsd.path` is a substring of `path`.
     */
    getNonStrict(path: string): ISchemaWorker | undefined

    /**
     * Returns all workers that should always be consulted regardless of
     * namespace matching (alwaysInclude) plus those whose includeIfRootTag
     * matches the current root tag.
     */
    getAlwaysIncludedWorkers(rootTag: string | undefined): ISchemaWorker[]

    getXsdList(): IXsd[]
    getAllWorkers(): ISchemaWorker[]

    /**
     * Find the best worker that declares `elementName` as a known element
     * under `parentName` (or as a root element when `parentName` is null).
     */
    getWorkerForElement(
        elementName: string,
        parentName: string | null,
    ): ISchemaWorker | undefined
}
