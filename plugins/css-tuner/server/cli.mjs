import { createRequire as __cssTunerRequire } from 'node:module';
const require = __cssTunerRequire(import.meta.url);
import{rpc,stopDaemon}from"./chunks/chunk-LTIEAGYU.mjs";import{DEFAULT_SETTINGS}from"./chunks/chunk-PDOLLRFM.mjs";import{VERSION}from"./chunks/chunk-6G2IXYTZ.mjs";import{resolve}from"node:path";var HELP=`CSS Tuner ${VERSION}

Usage:
  css-tuner open [url] [--root <dir>]   Open a page (dev server URL or local HTML), print the URL to open
  css-tuner status [--root <dir>]       Page connection and change counts
  css-tuner changes [--root <dir>]      List changes
  css-tuner config [key] [value]        Show or change settings (${Object.keys(DEFAULT_SETTINGS).join(", ")})
  css-tuner stop                        Stop the background service
  css-tuner daemon                      Run the background service in the foreground
`;function flag(args,name){let i=args.indexOf(name);if(i<0)return;let v=args[i+1];return args.splice(i,2),v}function parseValue(key,raw){let kind=typeof DEFAULT_SETTINGS[key];return kind==="number"?Number(raw):kind==="boolean"?raw==="true"||raw==="on"||raw==="1":key==="assetsDir"?raw==="null"||raw===""?null:resolve(raw):raw}async function main(argv){let args=[...argv],root=resolve(flag(args,"--root")??process.cwd()),[cmd,...rest]=args;switch(cmd){case"open":{let r=await rpc("open",{root,url:rest[0]});console.log(r.url),r.reachable===!1&&console.error(`warning: ${r.target} is not responding`);return}case"status":console.log(JSON.stringify(await rpc("status",{root}),null,2));return;case"changes":console.log(JSON.stringify(await rpc("changes",{root}),null,2));return;case"config":{let[key,value]=rest;if(key&&!(key in DEFAULT_SETTINGS))throw new Error(`unknown setting ${key}`);let set=key&&value!==void 0?{[key]:parseValue(key,value)}:void 0,all=await rpc("settings",{set});console.log(key?JSON.stringify(all[key]):JSON.stringify(all,null,2));return}case"stop":console.log(await stopDaemon()?"stopped":"not running");return;case"daemon":{let{Daemon}=await import("./chunks/daemon-VF2RPEIG.mjs");await new Daemon().start()||process.exit(1);return}default:console.log(HELP)}}main(process.argv.slice(2)).catch(e=>{console.error(e.message),process.exit(1)});
