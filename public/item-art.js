import {cardPreview} from './card-art.js';
import { pieceArt } from './skin-art.js';
import { drawCue } from './pool-cue.js';
import { fleetPreview } from './battleship-art.js';

// Catalog content is static; account data is never inserted as markup.
export function renderItemArt(root,item){
  root.replaceChildren();root.dataset.item=item.id;
  if(item.type==='skin')for(const side of ['white','black']){
    const piece=document.createElement('span');piece.className=`piece ${side} skin-${item.value}`;
    piece.innerHTML=pieceArt(item.value);root.append(piece);
  }
  else if(item.type==='card')root.innerHTML=cardPreview(item.value);
  else if(item.type==='ship')root.innerHTML=fleetPreview(item.value);
  else if(item.type==='cue'){
    const canvas=document.createElement('canvas');canvas.width=400;canvas.height=140;canvas.className='shop-cue-preview';
    canvas.dataset.cue=item.value;const ctx=canvas.getContext('2d');ctx.translate(365,70);drawCue(ctx,item.value);root.append(canvas);
  }else{
    const symbol=document.createElement('span');symbol.className='shop-art-symbol';symbol.textContent=item.symbol;root.append(symbol);
  }
}
