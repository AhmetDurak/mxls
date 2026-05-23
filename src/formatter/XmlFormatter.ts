import { format } from 'prettier'
import xmlPlugin from '@prettier/plugin-xml'

export class XmlFormatter {
    async format(xml: string): Promise<string> {
        return format(xml, {
            parser: 'xml',
            plugins: [xmlPlugin],
            printWidth: 120,
            tabWidth: 2,
        })
    }
}
