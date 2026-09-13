export const NEWPORT_NEWS_URL='https://apps.nnva.gov/police-dashboard/ActiveWarrants.aspx';

const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();

export function parseNewportNewsWarrants(html){
  if(!/Active Warrants as of/i.test(html)) throw new Error('Expected Newport News Active Warrants heading was not found.');
  const rows=[...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const records=[];
  for(const row of rows){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>strip(m[1]));
    if(cells.length<11) continue;
    const [full_name,height,weight,hair_color,eye_color,date_of_birth,age,sex,race,issue_date,warrant_charge]=cells;
    if(!full_name || /^name$/i.test(full_name)) continue;
    records.push({full_name,height,weight,hair_color,eye_color,date_of_birth,age,sex,race,issue_date,warrant_charge});
  }
  if(!records.length) throw new Error('No Newport News active-warrant rows could be safely parsed.');
  return records;
}

export async function fetchNewportNewsWarrants(fetchImpl=fetch){
  const retrievedAt=new Date().toISOString();
  const response=await fetchImpl(NEWPORT_NEWS_URL,{headers:{'user-agent':'VA-Warrant-Watch/1.0'}});
  if(!response.ok) throw new Error(`Newport News source returned HTTP ${response.status}.`);
  const html=await response.text();
  const rows=parseNewportNewsWarrants(html);
  return {jurisdiction:'Newport News, VA',agency:'Newport News Police Department',source_url:NEWPORT_NEWS_URL,retrieved_at:retrievedAt,records:rows.map((r,i)=>({id:`newport-news-${i+1}-${r.full_name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,full_name:r.full_name,jurisdiction:'Newport News, VA',issuing_agency:'Newport News Police Department',warrant_description:r.warrant_charge||'Active warrant',date_of_birth:r.date_of_birth,issue_date:r.issue_date,status:'ACTIVE_VERIFIED',source_url:NEWPORT_NEWS_URL,last_verified_at:retrievedAt}))};
}
