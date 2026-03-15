import { useMemo } from 'react'
import type { Document } from '../../shared/types/document'
import type { LayoutResult } from '../../shared/layout/types'
import { balancedLayout } from '../../shared/layout/balanced'
import { measureNodeSizes } from '../../shared/layout/text-measure'

export function useLayout(doc: Document): LayoutResult {
  return useMemo(() => {
    const nodeSizes = measureNodeSizes(doc)
    return balancedLayout(doc, nodeSizes)
  }, [doc])
}
