import { ImageResponse } from 'next/og';
export const alt = 'NAMAE — Your name, around the world.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';
export default function Image() {
 return new ImageResponse(<div style={{width:'100%',height:'100%',background:'#101211',color:'#f1f3ed',display:'flex',flexDirection:'column',padding:'65px 80px',justifyContent:'space-between'}}><div style={{display:'flex',fontSize:35,letterSpacing:-2}}>NAMAE</div><div style={{display:'flex',flexDirection:'column'}}><div style={{fontSize:20,color:'#c9ed9d',letterSpacing:6}}>YOUR PARALLEL NAME</div><div style={{fontSize:76,marginTop:25,lineHeight:1.1}}>Your name.</div><div style={{fontSize:76,color:'#c9ed9d',lineHeight:1.1}}>Around the world.</div></div><div style={{display:'flex',fontSize:20,color:'#a3aaa4'}}>CHOOSE YOUR COUNTRY · EXPLORE THE WORLD</div></div>,size);
}
