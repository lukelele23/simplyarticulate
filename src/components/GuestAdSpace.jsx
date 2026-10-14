import './guestAdSpace.css';

// Layout only. Keep the AdSense verification tag separate from ad delivery.
// Render only after authentication is resolved by the parent page.
export default function GuestAdSpace({isAuthenticated=false,placement='browse'}) {
 if(isAuthenticated)return null;
 return <aside className="guest-ad-space" aria-label="Advertisement" data-ad-placement={placement}>
  <span className="guest-ad-label">Advertisement</span>
  <div className="guest-ad-reserved" data-ad-container={placement}>
   <span>Ad space</span>
  </div>
 </aside>;
}
