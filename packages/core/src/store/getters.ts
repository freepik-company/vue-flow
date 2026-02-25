import type { ComputedRef } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import type { ComputedGetters, EdgeLookup, GraphEdge, GraphNode, NodeLookup, State } from '../types'
import type { ViewportTransform } from '../types/zoom'
import { getNodesInside, isEdgeVisible } from '../utils'
import { defaultEdgeTypes, defaultNodeTypes } from '../utils/defaultNodesEdges'

export function useGetters(
  state: State,
  nodeLookup: ComputedRef<NodeLookup>,
  edgeLookup: ComputedRef<EdgeLookup>,
): ComputedGetters {
  /**
   * @deprecated will be removed in next major version; use findNode instead
   */
  const getNode: ComputedGetters['getNode'] = computed(() => (id) => nodeLookup.value.get(id))

  /**
   * @deprecated will be removed in next major version; use findEdge instead
   */
  const getEdge: ComputedGetters['getEdge'] = computed(() => (id) => edgeLookup.value.get(id))

  const getEdgeTypes: ComputedGetters['getEdgeTypes'] = computed(() => {
    const edgeTypes: Record<string, any> = {
      ...defaultEdgeTypes,
      ...state.edgeTypes,
    }

    const keys = Object.keys(edgeTypes)

    for (const e of state.edges) {
      e.type && !keys.includes(e.type) && (edgeTypes[e.type] = e.type)
    }

    return edgeTypes
  })

  const getNodeTypes: ComputedGetters['getNodeTypes'] = computed(() => {
    const nodeTypes: Record<string, any> = {
      ...defaultNodeTypes,
      ...state.nodeTypes,
    }

    const keys = Object.keys(nodeTypes)

    for (const n of state.nodes) {
      n.type && !keys.includes(n.type) && (nodeTypes[n.type] = n.type)
    }

    return nodeTypes
  })

  // Throttled viewport for visibility culling — decouples CSS transform (60fps) from expensive
  // getNodesInside/isEdgeVisible recalculations (throttled to visibilityUpdateFrequency)
  const _cullingViewport = shallowRef<ViewportTransform>({ x: 0, y: 0, zoom: 1 })
  let _cullingLastUpdate = 0
  let _cullingTimer: ReturnType<typeof setTimeout> | null = null

  watch(
    () => state.viewport,
    (vp) => {
      const freq = state.visibilityUpdateFrequency
      if (!freq) {
        _cullingViewport.value = vp
        return
      }
      const now = performance.now()
      const elapsed = now - _cullingLastUpdate
      if (elapsed >= freq) {
        _cullingLastUpdate = now
        _cullingViewport.value = vp
        if (_cullingTimer) {
          clearTimeout(_cullingTimer)
          _cullingTimer = null
        }
      } else if (!_cullingTimer) {
        _cullingTimer = setTimeout(() => {
          _cullingTimer = null
          _cullingLastUpdate = performance.now()
          _cullingViewport.value = state.viewport
        }, freq - elapsed)
      }
    },
    { deep: true, immediate: true },
  )

  const getNodes: ComputedGetters['getNodes'] = computed(() => {
    if (state.onlyRenderVisibleElements) {
      const buffer = state.visibilityBuffer || 0
      return getNodesInside(
        state.nodes,
        {
          x: -buffer,
          y: -buffer,
          width: state.dimensions.width + buffer * 2,
          height: state.dimensions.height + buffer * 2,
        },
        _cullingViewport.value,
        true,
      )
    }

    return state.nodes
  })

  const getEdges: ComputedGetters['getEdges'] = computed(() => {
    if (state.onlyRenderVisibleElements) {
      const buffer = state.visibilityBuffer || 0
      const visibleEdges: GraphEdge[] = []

      for (const edge of state.edges) {
        const source = nodeLookup.value.get(edge.source)!
        const target = nodeLookup.value.get(edge.target)!

        if (
          isEdgeVisible({
            sourcePos: source.computedPosition || { x: 0, y: 0 },
            targetPos: target.computedPosition || { x: 0, y: 0 },
            sourceWidth: source.dimensions.width,
            sourceHeight: source.dimensions.height,
            targetWidth: target.dimensions.width,
            targetHeight: target.dimensions.height,
            width: state.dimensions.width + buffer * 2,
            height: state.dimensions.height + buffer * 2,
            viewport: _cullingViewport.value,
          })
        ) {
          visibleEdges.push(edge)
        }
      }

      return visibleEdges
    }

    return state.edges
  })

  const getElements: ComputedGetters['getElements'] = computed(() => [...getNodes.value, ...getEdges.value])

  const getSelectedNodes: ComputedGetters['getSelectedNodes'] = computed(() => {
    const selectedNodes: GraphNode[] = []
    for (const node of state.nodes) {
      if (node.selected) {
        selectedNodes.push(node)
      }
    }

    return selectedNodes
  })

  const getSelectedEdges: ComputedGetters['getSelectedEdges'] = computed(() => {
    const selectedEdges: GraphEdge[] = []
    for (const edge of state.edges) {
      if (edge.selected) {
        selectedEdges.push(edge)
      }
    }

    return selectedEdges
  })

  const getSelectedElements: ComputedGetters['getSelectedElements'] = computed(() => [
    ...getSelectedNodes.value,
    ...getSelectedEdges.value,
  ])

  /**
   * @deprecated will be removed in next major version; use `useNodesInitialized` instead
   */
  const getNodesInitialized: ComputedGetters['getNodesInitialized'] = computed(() => {
    const initializedNodes: GraphNode[] = []

    for (const node of state.nodes) {
      if (!!node.dimensions.width && !!node.dimensions.height && node.handleBounds !== undefined) {
        initializedNodes.push(node)
      }
    }

    return initializedNodes
  })

  /**
   * @deprecated will be removed in next major version; use `useNodesInitialized` instead
   */
  const areNodesInitialized: ComputedGetters['areNodesInitialized'] = computed(
    () => getNodes.value.length > 0 && getNodesInitialized.value.length === getNodes.value.length,
  )

  return {
    getNode,
    getEdge,
    getElements,
    getEdgeTypes,
    getNodeTypes,
    getEdges,
    getNodes,
    getSelectedElements,
    getSelectedNodes,
    getSelectedEdges,
    getNodesInitialized,
    areNodesInitialized,
  }
}
