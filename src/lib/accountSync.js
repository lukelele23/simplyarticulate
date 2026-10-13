export function cloudPayload(item){if(item.syncFeedback)return item;const {analysis,...progress}=item;return progress;}
export function mergeAccountRows(items,remote,pending){
 const merged=new Map(items.map(item=>[item.id,item]));
 for(const row of remote){if(pending[row.item_id])continue;if(row.deleted)merged.delete(row.item_id);else {const local=merged.get(row.item_id);merged.set(row.item_id,local?.analysis&&!local.syncFeedback&&!row.payload.analysis?{...row.payload,analysis:local.analysis}:row.payload);}}
 for(const [id,row] of Object.entries(pending)){if(row.deleted)merged.delete(id);else merged.set(id,items.find(item=>item.id===id)||row.payload);}
 return [...merged.values()].filter(s=>s&&typeof s.topic==='string'&&typeof s.date==='string').sort((a,b)=>(b.createdAt||b.date).localeCompare(a.createdAt||a.date));
}
export function settleAccountWrite(state,id,operation,response){
 if(state.pending[id]?.operation!==operation){
  if(response.applied&&state.pending[id])return {...state,versions:{...state.versions,[id]:response.row.version},pending:{...state.pending,[id]:{...state.pending[id],baseVersion:response.row.version}}};
  return state;
 }
 const pending={...state.pending};delete pending[id];
 const row=response.row,versions={...state.versions,[id]:row?.version||0};
 let items=state.items;
 if(!response.applied){items=items.filter(item=>item.id!==id);if(row&&!row.deleted)items=[row.payload,...items];}
 return {...state,pending,versions,items};
}
