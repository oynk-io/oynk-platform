import { useEffect, useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { KitEventType, Networks } from '@creit.tech/stellar-wallets-kit/types';
import { Wallet, Unplug } from 'lucide-react';

let initialized=false;
function initialize(){if(initialized)return;StellarWalletsKit.init({modules:defaultModules(),network:Networks.TESTNET});initialized=true;}
export function WalletConnection(){
 const[address,setAddress]=useState<string>();const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 useEffect(()=>{initialize();const offState=StellarWalletsKit.on(KitEventType.STATE_UPDATED,event=>setAddress(event.payload.address));const offDisconnect=StellarWalletsKit.on(KitEventType.DISCONNECT,()=>setAddress(undefined));StellarWalletsKit.getAddress().then(value=>setAddress(value.address)).catch(()=>{});return()=>{offState();offDisconnect();};},[]);
 async function connect(){setBusy(true);setError('');try{setAddress((await StellarWalletsKit.authModal()).address);}catch{setError('Wallet connection was cancelled or unavailable.');}finally{setBusy(false);}}
 async function disconnect(){setBusy(true);try{await StellarWalletsKit.disconnect();setAddress(undefined);}finally{setBusy(false);}}
 return <div className="wallet-connection">{address?<><span className="wallet-dot"><Wallet/></span><div><small>Connected wallet</small><strong title={address}>{address.slice(0,6)}…{address.slice(-6)}</strong></div><button onClick={()=>void disconnect()} disabled={busy} aria-label="Disconnect Stellar wallet"><Unplug/></button></>:<button className="wallet-connect" onClick={()=>void connect()} disabled={busy}><Wallet/>{busy?'Connecting…':'Connect wallet'}</button>}{error?<span className="wallet-error" role="alert">{error}</span>:null}</div>;
}
