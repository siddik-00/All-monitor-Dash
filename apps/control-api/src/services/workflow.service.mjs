export function createWorkflowService(repository,toolchainService) {
  return {
    list:()=>({kind:'architecture-workflow-catalog',workflows:repository.list()}),
    get:async id=>({kind:'architecture-workflow',workflow:await repository.get(id)}),
    async topology() {
      const [workflow,toolchain]=await Promise.all([repository.get('system'),toolchainService.list()]);
      return {mode:toolchain.mode,kind:'devops-tool-topology',workflow,observations:toolchain.tools.map(t=>({nodeId:t.id,...t.observation})),timestamp:toolchain.timestamp};
    }
  };
}
