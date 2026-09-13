export const NORFOLK_DATASET_ID='cab7-wvn5';
export const NORFOLK_SOURCE_URL='https://data.norfolk.gov/widgets/cab7-wvn5';
export const NORFOLK_API_URL=`https://data.norfolk.gov/api/v3/views/${NORFOLK_DATASET_ID}/query.json`;

function clean(v){return v==null?'':String(v).trim();}
function unwrapRows(payload){
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload?.data)) return payload.data;
  if(Array.isArray(payload?.rows)) return payload.rows;
  if(Array.isArray(payload?.results)) return payload.results;
  throw new Error('Norfolk API returned an unexpected response shape.');
}
export function normalizeNorfolkRows(payload){
  const rows=unwrapRows(payload); const out=[];
  for(const row of rows){
    const first=clean(row.first),last=clean(row.last);
    if(!first||!last) continue;
    out.push({first,last,dob:clean(row.dob),issue_date:clean(row.issudate),warrant_charge:clean(row.wa_chrg)});
  }
  if(!out.length) throw new Error('Norfolk API returned no safely recognizable active-warrant records.');
  return out;
}
export async function fetchNorfolkWarrants(fetchImpl=fetch){
  const retrievedAt=new Date().toISOString(); let rows=[]; let pageNumber=1;
  while(pageNumber<=20){
    const response=await fetchImpl(`${NORFOLK_API_URL}?pageNumber=${pageNumber}&pageSize=5000`,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'VA-Warrant-Watch/1.0'},body:JSON.stringify({query:'SELECT *',page:{pageNumber,pageSize:5000},includeSynthetic:false})});
    if(!response.ok) throw new Error(`Norfolk active-warrants API returned HTTP ${response.status}.`);
    const page=unwrapRows(await response.json()); rows.push(...page);
    if(page.length<5000) break; pageNumber++;
  }
  const normalized=normalizeNorfolkRows(rows);
  return {jurisdiction:'Norfolk, VA',agency:'Norfolk Police Department',source_url:NORFOLK_SOURCE_URL,retrieved_at:retrievedAt,records:normalized.map((r,i)=>({id:`norfolk-${i+1}-${r.first.toLowerCase()}-${r.last.toLowerCase()}`.replace(/[^a-z0-9-]+/g,'-'),full_name:`${r.first} ${r.last}`,jurisdiction:'Norfolk, VA',issuing_agency:'Norfolk Police Department',warrant_description:r.warrant_charge||'Active warrant',date_of_birth:r.dob,issue_date:r.issue_date,status:'ACTIVE_VERIFIED',source_url:NORFOLK_SOURCE_URL,last_verified_at:retrievedAt}))};
}
