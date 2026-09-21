export interface ToolResponse extends Record<string, unknown> {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}
