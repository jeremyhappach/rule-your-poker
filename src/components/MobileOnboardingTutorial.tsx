import {useEffect,useState} from 'react';
import {Bell,Check,ChevronDown,Download,MoreVertical,Share,Smartphone} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Carousel,CarouselContent,CarouselItem,type CarouselApi} from '@/components/ui/carousel';
import {Button} from '@/components/ui/button';
import {detectMobile,type MobilePlatform,type OnboardingDecision} from '@/lib/mobileOnboarding';
import './MobileOnboardingTutorial.css';

export function MobileOnboardingTutorial({onClose,onOpenSettings}:{onClose:(decision:OnboardingDecision)=>void;onOpenSettings:()=>void}) {
 const detected=detectMobile(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
 const [platform,setPlatform]=useState<MobilePlatform>(detected.platform);
 const [api,setApi]=useState<CarouselApi>(),[slide,setSlide]=useState(0);
 useEffect(()=>{if(!api)return;const select=()=>setSlide(api.selectedScrollSnap());select();api.on('select',select);return()=>{api.off('select',select);};},[api]);
 const iphone=platform==='iphone';
 const steps=iphone
  ?[detected.chromeIOS?'Open P-Town Poker in Chrome.':'Open P-Town Poker in Safari.','Tap Share (inside the page menu on some layouts).','Choose Add to Home Screen.','Keep Open as Web App on, if shown, then tap Add.','Launch from the new Home Screen icon.']
  :['Open P-Town Poker in Chrome.','Tap the three-dot browser menu.','Choose Install app or Add to Home screen.','If shown, choose Install and create shortcut. Confirm Install/Add.','Launch from the new Home Screen icon.'];
 return <Dialog open onOpenChange={open=>{if(!open)onClose('snooze');}}><DialogContent className="dark mobile-onboarding">
  <DialogHeader className="pr-8 text-left"><DialogTitle className="text-lg text-amber-200">Get the Most from P-Town Poker</DialogTitle><DialogDescription className="sr-only">Two quick steps to install the app and set up notifications. You can skip or replay this guide.</DialogDescription></DialogHeader>
  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/70 p-1" role="group" aria-label="Phone platform">
   {(['iphone','android'] as const).map(value=><Button key={value} size="sm" variant={platform===value?'secondary':'ghost'} aria-pressed={platform===value} onClick={()=>setPlatform(value)}>{value==='iphone'?'iPhone':'Android'}</Button>)}
  </div>
  <Carousel setApi={setApi} opts={{watchDrag:true,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:20}} className="min-h-0 overflow-y-auto overscroll-contain" aria-label="Install app and notifications tutorial">
   <CarouselContent className="items-start">
    <CarouselItem className={slide!==0?'h-0 overflow-hidden':''} aria-hidden={slide!==0} {...(slide!==0?{inert:''}:{})}>
     <section className="space-y-3" aria-label="Install P-Town Poker">
      <div><h2 className="text-xl font-semibold">Install P-Town Poker</h2><p className="mt-1 text-sm text-muted-foreground">Add P-Town Poker to your Home Screen for the best app-like experience.</p></div>
      <div className="onboarding-phone" role="img" aria-label={iphone?'Phone Share menu with Add to Home Screen':'Android browser menu with Install app'}>
       <img src="/icons/ptown-poker-v2-192.png" alt="" className="h-10 w-10 rounded-xl"/>
       <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs text-slate-300">{iphone?<Share size={17}/>:<MoreVertical size={17}/>} {iphone?'Share menu':'Chrome menu'}</div><div className="mt-2 flex items-center gap-2 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-2 text-sm text-amber-100"><Download size={16}/>{iphone?'Add to Home Screen':'Install app / Add to Home screen'}</div></div>
      </div>
      <ol className="onboarding-steps">{steps.map((step,i)=><li key={i}><span aria-hidden="true">{i+1}</span><p>{step}</p></li>)}</ol>
     </section>
    </CarouselItem>
    <CarouselItem className={slide!==1?'h-0 overflow-hidden':''} aria-hidden={slide!==1} {...(slide!==1?{inert:''}:{})}>
     <section className="space-y-3" aria-label="Enable Notifications">
      <div><h2 className="text-xl font-semibold">Enable Notifications</h2><p className="mt-1 text-sm text-muted-foreground">Get notified when it’s your turn, when someone invites you to a match, and when important game updates occur.</p></div>
      <div className="rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs" role="img" aria-label="Example of player notification settings: This device, Match invitations, Your turn, and Quiet hours">
       <div className="mb-2 flex items-center justify-between font-semibold"><span className="flex items-center gap-2"><Bell size={16}/>Notifications</span><ChevronDown size={16}/></div>
       <div className="flex items-center justify-between"><span>This device</span><span className="rounded border px-2 py-1">Enable on this device</span></div>
       <div className="mt-2 flex items-center gap-2"><Check size={13}/>Match invitations <span className="ml-2 flex items-center gap-1"><Check size={13}/>Your turn</span></div>
       <p className="mt-2 text-slate-400">Quiet hours · Your preferences stay in control</p>
      </div>
      <ol className="onboarding-steps">
       <li><span aria-hidden="true">1</span><p>Open P-Town Poker from its Home Screen icon.</p></li>
       <li><span aria-hidden="true">2</span><p>Open Settings, then expand Notifications.</p></li>
       <li><span aria-hidden="true">3</span><p>Tap Enable on this device, then Allow. Choose the alerts you want.</p></li>
      </ol>
      <p className="text-xs text-muted-foreground">{iphone?'iPhone push requires the Home Screen web app on iOS 16.4 or later.':'Your device permission and individual alert preferences both apply.'}</p>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1 text-amber-200">Previously tapped Don’t Allow?</summary><p className="pt-1">{iphone?'Open iPhone Settings → Notifications → P-Town Poker (or the name you chose) → Allow Notifications. Then return here.':'Open Android Settings → Apps → P-Town Poker or Chrome → Notifications. Also check Chrome → Site settings → Notifications for this site, then return here.'}</p></details>
      <Button variant="outline" className="w-full" onClick={onOpenSettings}><Smartphone className="mr-2 h-4 w-4"/>Open Notification Settings</Button>
     </section>
    </CarouselItem>
   </CarouselContent>
  </Carousel>
  <div className="flex items-center justify-between gap-3 pt-1">
   <Button variant="ghost" disabled={slide===0} onClick={()=>api?.scrollPrev()}>Back</Button>
   <div className="flex" role="group" aria-label="Tutorial slides">{[0,1].map(i=><button key={i} type="button" className="grid h-11 w-9 place-items-center" aria-label={`Go to slide ${i+1}`} aria-current={slide===i?'step':undefined} onClick={()=>api?.scrollTo(i)}><span className={`h-2 w-2 rounded-full ${slide===i?'bg-amber-300':'bg-slate-600'}`}/></button>)}</div>
   {slide===0?<Button onClick={()=>api?.scrollNext()}>Next</Button>:<Button onClick={()=>onClose('complete')}>Done</Button>}
  </div>
  <div className="flex justify-between gap-2 border-t border-white/10 pt-1"><Button variant="ghost" size="sm" className="text-xs" onClick={()=>onClose('snooze')}>Maybe Later · 7 days</Button><Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={()=>onClose('dismiss')}>Don’t Show Again</Button></div>
 </DialogContent></Dialog>;
}
