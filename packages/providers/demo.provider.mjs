export function demoSnapshot(namespace = 'all', range = '1h') {
  const now = Date.now();
  const configs = [
    ['gateway-api','production',12,12,0,'2d 4h','a71c9e2'],
    ['identity-service','production',10,10,0,'4d 7h','c80d4b1'],
    ['activity-feed','production',6,6,1,'1d 12h','33a2f61'],
    ['reputation-service','production',5,6,8,'6h 20m','e65f27a'],
    ['event-workers','staging',7,8,2,'3d 2h','8941bc0'],
    ['redis-cache','staging',2,4,0,'5d 1h','8f2c3d9']
  ];
  const workloads = configs.map(([name,ns,ready,desired,restarts,age,revision]) => ({name,namespace:ns,ready,desired,restarts,age,revision,status:ready===desired?'Healthy':'Degraded',image:`ghcr.io/example/${name}:${revision}`})).filter(w=>namespace==='all'||w.namespace===namespace);
  const pods = workloads.flatMap((workload,workloadIndex)=>Array.from({length:workload.desired},(_,podIndex)=>{
    const ready=podIndex<workload.ready, restartCount=podIndex===workload.desired-1?workload.restarts:0;
    return {name:`${workload.name}-${workload.revision.slice(0,5)}-${String(podIndex+1).padStart(2,'0')}`,namespace:workload.namespace,deployment:workload.name,status:ready?'Running':restartCount?'CrashLoopBackOff':'Pending',ready,restarts:restartCount,node:ready?`worker-${String((workloadIndex+podIndex)%6+1).padStart(2,'0')}`:'',containers:[workload.name],phase:ready?'Running':'Pending',terminating:false,age:workload.age,image:workload.image};
  }));
  const nodes = Array.from({length:6},(_,i)=>({name:`worker-${String(i+1).padStart(2,'0')}`,ready:true,role:i<3?'general':'compute',zone:`zone-${['a','b','c'][i%3]}`,cpuCapacity:i<3?8:16,memoryGiB:i<3?32:64,version:'v1.35.0',pressure:i===4?['MemoryPressure']:[],age:`${19+i}d`,ip:`10.20.${i%3+1}.${20+i}`}));
  const duration={'1h':3600,'6h':21600,'24h':86400}[range]||3600;
  const series = Array.from({length:61},(_,i)=>({time:Math.floor(now/1000-duration+i*duration/60),cpu:+(35+8*Math.sin(i*.2)+4*Math.sin(i*.72)).toFixed(1),memory:+(58+5*Math.sin(i*.12)+i*.07).toFixed(1)}));
  const alerts = [
    {name:'KubeDeploymentReplicasMismatch',severity:'warning',state:'firing',namespace:'production',summary:'Reputation service is missing one replica.',description:'5 of 6 replicas are available. Inspect the restarting pod before scaling.',activeAt:new Date(now-12*60000).toISOString()},
    {name:'KubePodPending',severity:'warning',state:'firing',namespace:'staging',summary:'Redis has two pods waiting for scheduling.',description:'Review pod events, resource requests, and available node capacity.',activeAt:new Date(now-7*60000).toISOString()},
    {name:'NodeMemoryPressure',severity:'warning',state:'pending',namespace:'',summary:'worker-05 reports memory pressure.',description:'Inspect node conditions and the largest memory consumers.',activeAt:new Date(now-2*60000).toISOString()}
  ].filter(a=>namespace==='all'||!a.namespace||a.namespace===namespace);
  const events = [
    {type:'Warning',reason:'BackOff',namespace:'production',object:'reputation-service-6df84-kt8wz',message:'Back-off restarting failed container reputation-service',time:new Date(now-4*60000).toISOString(),count:8},
    {type:'Warning',reason:'FailedScheduling',namespace:'staging',object:'redis-cache-7c9f-p2t8a',message:'0/6 nodes are available: insufficient memory.',time:new Date(now-7*60000).toISOString(),count:3},
    {type:'Normal',reason:'ScalingReplicaSet',namespace:'production',object:'gateway-api',message:'Scaled replica set gateway-api-779d to 12.',time:new Date(now-18*60000).toISOString(),count:1},
    {type:'Normal',reason:'Pulled',namespace:'production',object:'activity-feed-78db9-vr48q',message:'Successfully pulled the container image.',time:new Date(now-25*60000).toISOString(),count:1}
  ].filter(e=>namespace==='all'||e.namespace===namespace);
  return {mode:'demo',cluster:'orbit-lab',timestamp:new Date(now).toISOString(),namespace,range,namespaces:['production','staging','monitoring','kube-system'],version:'v1.35.0',summary:{readyNodes:6,totalNodes:6,readyPods:pods.filter(p=>p.ready).length,totalPods:pods.length,workloads:workloads.length,cpuPercent:series.at(-1).cpu,memoryPercent:series.at(-1).memory,firingAlerts:alerts.filter(a=>a.state==='firing').length},nodes,workloads,events,alerts,series,pods,warnings:[],capabilities:{logs:false},integrations:[{name:'Kubernetes',status:'sample',detail:'Nodes, pods, workloads, and events'},{name:'Prometheus',status:'sample',detail:'CPU, memory, and alerts'}]};
}
