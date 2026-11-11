import sys, json, base64, numpy as np, netCDF4
ds = netCDF4.Dataset(sys.argv[1]); out = sys.argv[2]
print(ds.variables.keys())
t = ds.variables['time']; times = netCDF4.num2date(t[:], t.units, getattr(t,'calendar','standard'))
lat = ds.variables['lat'][:]; lon = ds.variables['lon'][:]
sst = ds.variables['sst'][:]  # time,lat,lon
sst = np.ma.filled(sst.astype('f4'), np.nan)
print(sst.shape, lat[:3], lat[-3:], lon[:3], lon[-3:], times[0], times[-1])
ym = np.array([(d.year, d.month) for d in times])
def sel(y, m): return np.where((ym[:,0]==y)&(ym[:,1]==m))[0][0]
clim = {m: np.nanmean(np.stack([sst[sel(y,m)] for y in range(1991,2021)]),0) for m in range(1,13)}
def djf(y):  # Dec y, Jan/Feb y+1
    return np.mean(np.stack([sst[sel(y,12)]-clim[12], sst[sel(y+1,1)]-clim[1], sst[sel(y+1,2)]-clim[2]]),0)
def nino34(a):
    la=(lat>=-5)&(lat<=5); lo=(lon>=190)&(lon<=240)
    w=np.cos(np.deg2rad(lat[la]))[:,None]; s=a[np.ix_(la,lo)]
    return float(np.nansum(s*w)/np.nansum(np.isfinite(s)*w))
for y in (1982,1997,2015,1988,1998,1999,2007,2010): print(y, round(nino34(djf(y)),2))
en, ln = djf(1997), djf(2010)
if lat[0] < lat[-1]:
    en, ln = en[::-1], ln[::-1]; lat = lat[::-1]
mask = np.isfinite(en)
def fill(a):
    a=a.copy()
    for _ in range(200):
        nan=~np.isfinite(a)
        if not nan.any(): break
        p=np.pad(a,((1,1),(0,0)),constant_values=np.nan)
        nb=np.stack([p[:-2],p[2:],np.roll(a,1,1),np.roll(a,-1,1)])
        m=np.nanmean(nb,0) if True else None
        a[nan]=m[nan]
    return a
import warnings; warnings.simplefilter('ignore')
def pack(a): return base64.b64encode(np.clip(np.round(fill(a)*20),-127,127).astype('i1').tobytes()).decode()
json.dump({'nlat':len(lat),'nlon':len(lon),'lat0':float(lat[0]),'dlat':float(lat[1]-lat[0]),'lon0':float(lon[0]),'dlon':float(lon[1]-lon[0]),
 'en':pack(en),'ln':pack(ln),'mask':base64.b64encode(mask.astype('u1').tobytes()).decode(),
 'n34':{'en':round(nino34(djf(1997)),1),'ln':round(nino34(djf(2010)),1)},
 'max':{'en':[float(np.nanmax(en)),float(np.nanmin(en))],'ln':[float(np.nanmax(ln)),float(np.nanmin(ln))]}}, open(out,'w'))
print(json.load(open(out))['n34'], json.load(open(out))['max'], lat[0], lat[1])
