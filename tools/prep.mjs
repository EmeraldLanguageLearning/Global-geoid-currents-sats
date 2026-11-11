import * as egm from 'egm96-universal';
import fs from 'fs';
const W=1440,H=721,g=new Int16Array(W*H);
let mn=1e9,mx=-1e9,mnp,mxp;
for(let i=0;i<H;i++){const lat=90-i*0.25;for(let j=0;j<W;j++){let lon=j*0.25; if(lon>180)lon-=360;
 const v=egm.meanSeaLevel(lat,lon);g[i*W+j]=Math.round(v*100);
 if(v<mn){mn=v;mnp=[lat,lon]} if(v>mx){mx=v;mxp=[lat,lon]}}}
console.log('min',mn,mnp,'max',mx,mxp);
// spot checks vs library (bilinear off-node) and known values
for(const [n,la,lo] of [['Colombo',6.93,79.85],['Paris',48.85,2.35],['Denver',39.74,-104.99],['Reykjavik',64.15,-21.94],['Lhasa',29.65,91.1]])
 console.log(n,egm.meanSeaLevel(la,lo).toFixed(2));
fs.writeFileSync('src/geoid.b64',Buffer.from(g.buffer).toString('base64'));
fs.writeFileSync('src/extremes.json',JSON.stringify({min:mn,minAt:mnp,max:mx,maxAt:mxp}));
// lakes: round coords, polygons rings only
const L=JSON.parse(fs.readFileSync('data/ne_50m_lakes.geojson','utf8'));
const r=c=>c.map(p=>[Math.round(p[0]*100)/100,Math.round(p[1]*100)/100]);
const polys=[];
for(const f of L.features){const gm=f.geometry;if(!gm)continue;
 const ps=gm.type==='Polygon'?[gm.coordinates]:gm.coordinates;for(const p of ps)polys.push(p.map(r));}
fs.writeFileSync('src/lakes.json',JSON.stringify(polys));
console.log('lakes',polys.length,fs.statSync('src/lakes.json').size,'geoid b64',fs.statSync('src/geoid.b64').size);
