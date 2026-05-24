import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import { getRootTag } from '../utils/XmlTextUtils'
import { logger } from '../utils/Logger'

/**
 * Instance-based (no static state) XML namespace resolver.
 * Extracts xmlns declarations from the document text and maps them to registered
 * XSD workers.  Results are cached by the xmlns fingerprint of the text.
 */
export class NamespaceResolver {
    private readonly cache = new Map<string, ISchemaWorker[]>()

    /**
     * Resolves which workers apply to `text` by matching its xmlns declarations
     * to registered schemas in `registry`.  Also includes always-included and
     * root-tag-matched workers.
     */
    resolve(text: string, registry: ISchemaRegistry): ISchemaWorker[] {
        const key = this.cacheKey(text)
        const hit = this.cache.get(key)
        if (hit) return hit

        const workers = this.compute(text, registry)
        this.cache.set(key, workers)
        logger.verbose(`namespace resolver: computed ${workers.length} worker(s) paths=[${workers.map(w => w.xsd.path).join(', ')}]`)
        return workers
    }

    /** Clear the cache (call when schemas are added, removed, or updated). */
    invalidate(): void {
        this.cache.clear()
    }

    private cacheKey(text: string): string {
        // Cache by the sorted set of xmlns declarations — changes rarely
        const matches = [...text.matchAll(/xmlns(?::[a-zA-Z_][\w.-]*)?="[^"]+"/g)]
        return matches.map(m => m[0]).sort().join('|')
    }

    private compute(text: string, registry: ISchemaRegistry): ISchemaWorker[] {
        const result: ISchemaWorker[] = []
        const seen = new Set<string>()

        const nsRe = /xmlns(?::([a-zA-Z_][\w.-]*))?="([^"]+)"/g
        let m: RegExpExecArray | null
        while ((m = nsRe.exec(text)) !== null) {
            const prefix = m[1] ?? ''
            const uri = m[2]
            const worker = registry.get(uri) ?? registry.getNonStrict(uri)
            if (worker && !seen.has(worker.xsd.path)) {
                seen.add(worker.xsd.path)
                result.push(prefix ? worker.withNamespace(prefix) : worker)
            }
        }

        const rootTag = getRootTag(text)
        for (const worker of registry.getAlwaysIncludedWorkers(rootTag)) {
            if (!seen.has(worker.xsd.path)) {
                seen.add(worker.xsd.path)
                result.push(worker)
            }
        }

        return result
    }
}
