import {useEffect,useRef,useState} from 'react';
import {Bell,Check,ChevronDown,Expand,Smartphone} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Carousel,CarouselContent,CarouselItem,type CarouselApi} from '@/components/ui/carousel';
import {Button} from '@/components/ui/button';
import {detectMobile,type MobilePlatform,type OnboardingDecision} from '@/lib/mobileOnboarding';
import {MobileInstallAnimation} from './MobileInstallAnimation';
import './MobileOnboardingTutorial.css';

export function MobileOnboardingTutorial({onClose,onOpenSettings}:{onClose:(decision:OnboardingDecision)=>void;onOpenSettings:()=>void}) {
 const detected=detectMobile(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
 const [platform,setPlatform]=useState<MobilePlatform>(detected.platform);
 const [api,setApi]=useState<CarouselApi>(),[slide,setSlide]=useState(0);
 const content=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(content.current)content.current.scrollTop=0;},[slide]);
 useEffect(()=>{if(!api)return;const select=()=>setSlide(api.selectedScrollSnap());select();api.on('select',select);return()=>{api.off('select',select);};},[api]);
 const iphone=platform==='iphone';
 const steps=iphone
  ?['Open holm357.com in Safari.','Tap Share (inside the page menu on some layouts).','Choose Add to Home Screen.','Keep Open as Web App on, if shown, then tap Add.','Launch from the new Home Screen icon.']
  :['Open holm357.com in Chrome.','Tap the three-dot browser menu.','Choose Install app or Add to Home screen.','If shown, choose Install and create shortcut. Confirm Install/Add.','Launch from the new Home Screen icon.'];
 return <Dialog open onOpenChange={open=>{if(!open)onClose('snooze');}}><DialogContent className="dark mobile-onboarding">
  <DialogHeader className="pr-8 text-left"><DialogTitle className="text-lg text-amber-200">Get the Most from P-Town Poker</DialogTitle><DialogDescription className="sr-only">Two quick steps to install the app and set up notifications. You can skip or replay this guide.</DialogDescription></DialogHeader>
  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/70 p-1" role="group" aria-label="Phone platform">
   {(['iphone','android'] as const).map(value=><Button key={value} size="sm" variant={platform===value?'secondary':'ghost'} aria-pressed={platform===value} onClick={()=>setPlatform(value)}>{value==='iphone'?'iPhone':'Android'}</Button>)}
  </div>
  <Carousel ref={content} setApi={setApi} opts={{watchDrag:true,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:20}} className="onboarding-content" aria-label="Install app and notifications tutorial">
   <CarouselContent className="items-start">
    <CarouselItem className={slide!==0?'h-0 overflow-hidden':''} aria-hidden={slide!==0} {...(slide!==0?{inert:''}:{})}>
     <section className="space-y-3" aria-label="Install P-Town Poker">
      <div><h2 className="text-xl font-semibold">Install P-Town Poker</h2><p className="mt-1 text-sm text-muted-foreground">Add P-Town Poker to your Home Screen for the best app-like experience.</p></div>
      <div className="onboarding-benefits"><h3>Why install P-Town Poker?</h3><ul>
       <li><Expand size={17}/><p><strong>Full-screen gameplay.</strong> Play without browser address bars and tabs.</p></li>
       <li><Smartphone size={17}/><p><strong>Your app icon.</strong> Launch directly from the branded P-Town Poker Home Screen icon.</p></li>
       <li><Bell size={17}/><p><strong>Optional notifications.</strong> Get invitations, available-turn alerts, and important game updates without keeping the app open.</p></li>
      </ul></div>
      <MobileInstallAnimation platform={platform} active={slide===0}/>
      {iphone&&detected.chromeIOS&&<p className="text-xs text-muted-foreground">Using Chrome on iPhone? Its Share menu also offers Add to Home Screen. The preview above shows Safari.</p>}
      <ol className="onboarding-steps">{steps.map((step,i)=><li key={i}><span aria-hidden="true">{i+1}</span><p>{step}</p></li>)}</ol>
     </section>
    </CarouselItem>
    <CarouselItem className={slide!==1?'h-0 overflow-hidden':''} aria-hidden={slide!==1} {...(slide!==1?{inert:''}:{})}>
     <section className="space-y-3" aria-label="Enable Notifications (Optional)">
      <div><h2 className="text-xl font-semibold">Enable Notifications <span className="text-amber-200">(Optional)</span></h2><p className="mt-1 text-sm text-muted-foreground">Stay updated when it’s your turn, when someone invites you to a game, or when important match events occur.</p><p className="mt-2 text-sm"><strong>Notifications are completely optional.</strong> You can turn them on or off anytime in P-Town Poker Settings.</p></div>
      <div className="rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs" role="img" aria-label="Example of player notification settings: This device, Match invitations, Your turn, and Quiet hours">
       <div className="mb-2 flex items-center justify-between font-semibold"><span className="flex items-center gap-2"><Bell size={16}/>Notifications</span><ChevronDown size={16}/></div>
       <div className="flex items-center justify-between"><span>This device</span><span className="rounded border px-2 py-1">Enable on this device</span></div>
       <div className="mt-2 flex items-center gap-2"><Check size={13}/>Match invitations <span className="ml-2 flex items-center gap-1"><Check size={13}/>Your turn</span></div>
       <div className="mt-3 rounded border border-amber-300/30 p-2"><strong className="text-amber-200">Quiet Hours</strong><p className="mt-1">Example: 10 PM → 7 AM · your time zone</p></div>
      </div>
      <div><h3 className="text-sm font-semibold">Quiet Hours</h3><p className="mt-1 text-sm text-muted-foreground">Choose times when you don’t want push notifications, such as 10 PM–7 AM. Your games continue normally, and you can check updates whenever you open P-Town Poker.</p></div>
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
  <div className="onboarding-navigation pt-1">
   <Button variant="ghost" disabled={slide===0} onClick={()=>api?.scrollPrev()}>Back</Button>
   <div className="flex" role="group" aria-label="Tutorial slides">{[0,1].map(i=><button key={i} type="button" className="grid h-11 w-9 place-items-center" aria-label={`Go to slide ${i+1}`} aria-current={slide===i?'step':undefined} onClick={()=>api?.scrollTo(i)}><span className={`h-2 w-2 rounded-full ${slide===i?'bg-amber-300':'bg-slate-600'}`}/></button>)}</div>
   {slide===0?<Button onClick={()=>api?.scrollNext()}>Next</Button>:<Button onClick={()=>onClose('complete')}>Done</Button>}
  </div>
  <div className="onboarding-decisions border-t border-white/10 pt-1"><Button variant="ghost" size="sm" className="text-xs" onClick={()=>onClose('snooze')}>Maybe Later · 7 days</Button><Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={()=>onClose('dismiss')}>Don’t Show Again</Button></div>
 </DialogContent></Dialog>;
}
