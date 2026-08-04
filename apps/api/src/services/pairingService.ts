import { pool } from "../db/pool.js";
/** Conservative heuristic only. Production should pair using your internal settlement/payment reference. */
export async function pairLikelySettlementLegs(){
 const {rows}=await pool.query(`SELECT id,direction,asset_symbol,usd_value,block_time FROM transfers WHERE pair_id IS NULL AND status='CONFIRMED' ORDER BY block_time ASC`);
 const used=new Set<string>();
 for(let i=0;i<rows.length;i++){const a=rows[i];if(used.has(a.id))continue;let best:null|{id:string;score:number}=null;
  for(let j=i+1;j<rows.length;j++){const b=rows[j];if(used.has(b.id)||a.direction===b.direction||a.asset_symbol!==b.asset_symbol)continue;
   const seconds=Math.abs(new Date(a.block_time).getTime()-new Date(b.block_time).getTime())/1000;if(seconds>6*60*60)continue;
   const av=Number(a.usd_value),bv=Number(b.usd_value),diff=Math.abs(av-bv)/Math.max(av,bv,1);if(diff>.01)continue;
   const score=diff*100+seconds/(6*60*60);if(!best||score<best.score)best={id:b.id,score};
  }
  if(best){await pool.query("UPDATE transfers SET pair_id=CASE WHEN id=$1 THEN $2 WHEN id=$2 THEN $1 END WHERE id IN ($1,$2)",[a.id,best.id]);used.add(a.id);used.add(best.id);}
 }
}
