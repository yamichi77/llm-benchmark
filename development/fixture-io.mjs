import fs from 'node:fs/promises';
const mode=process.argv[2];
if(mode==='models')console.log(JSON.stringify(['test-model']));
else if(mode==='arg')console.log(process.argv[3]);
else if(mode==='file')console.log(await fs.readFile(process.argv[3],'utf8'));
else if(mode==='permission'){for await(const ignored of process.stdin){}console.error('Fixture: action requires permission; noninteractive refusal');process.exitCode=77;}
else if(mode==='rate-limit'){let previous={};try{previous=JSON.parse(await fs.readFile('adapter-state.json','utf8'));}catch{}const continued=process.env.MODEL_BENCHMARK_RESUME==='continue';await fs.writeFile('adapter-state.json',JSON.stringify({status:continued?'success':'rate-limited',sessionId:'fixture-session',resumeAvailable:true,attemptIndex:(previous.attemptIndex||0)+1,retryAt:null}));if(continued)process.stdout.write('continued original task');else{process.stderr.write('usage limit reached');process.exitCode=75;}}
else throw Error('Unknown fixture mode');
