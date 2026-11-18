/** Chave das preferências no navegador (compartilhada entre servidor e cliente). */
export const PREFS_KEY = 'rpgai.prefs';

/** Script que roda antes da página aparecer, para não "piscar" o tema/tamanho errado. */
export const PREFS_INIT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('${PREFS_KEY}')||'{}'),d=document.documentElement;if(p.text&&p.text!=='normal')d.dataset.text=p.text;if(p.theme==='light')d.dataset.theme='light';if(p.contrast==='high')d.dataset.contrast='high';if(p.motion==='reduce')d.dataset.motion='reduce';}catch(e){}`;
