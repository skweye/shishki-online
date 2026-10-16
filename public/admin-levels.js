export const ADMIN_LEVELS=['Игрок','Наблюдатель','Управляющий','Главный администратор'];
export const canManage=(actor,target)=>!!actor&&actor.admin_level>=2&&(actor.admin_level>target.admin_level||actor.admin_level===3&&actor.id===target.id);
export const canSetLevel=(actor,target)=>actor?.admin_level===3&&canManage(actor,target);
