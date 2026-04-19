export interface GenerationExecutionPlan {
  workflow: Record<string, unknown>;
  resolvedParams: Record<string, unknown>;
  inputImagePath?: string;
  preferredOutputNodeId?: string;
}
