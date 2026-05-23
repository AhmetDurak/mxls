import { format } from 'prettier'
import htmlPlugin from 'prettier/plugins/html'

export class XmlFormatter {
    async format(xml: string): Promise<string> {
        return format(xml, {
            parser: 'html',
            plugins: [htmlPlugin],
            printWidth: 120,
            tabWidth: 2,
            bracketSameLine: true,
        })
    }
}
