import type { ICompletion } from '../types'

/**
 * Instance-based memoization of completion results.
 * Key: `[...ancestorChain, parentElement].join('>')` when chain is non-empty,
 * else just `parentElement`.
 */
export class CompletionCache {
    private readonly cache = new Map<string, ICompletion[]>()

    makeKey(parentTag: string, ancestorChain: string[]): string {
        return ancestorChain.length > 0
            ? [...ancestorChain, parentTag].join('>')
            : parentTag
    }

    get(key: string): ICompletion[] | undefined {
        return this.cache.get(key)
    }

    set(key: string, completions: ICompletion[]): void {
        this.cache.set(key, completions)
    }

    clear(): void {
        this.cache.clear()
    }
}
