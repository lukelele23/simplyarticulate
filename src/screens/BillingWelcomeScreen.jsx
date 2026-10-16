import BillingPanel from '../components/BillingPanel.jsx';
import '../components/pricingCards.css';
export default function BillingWelcomeScreen({user,onSignUp}){
 return <main id="main-content" tabIndex={-1} className="billing-welcome"><span className="pricing-mode">Subscription</span><h1>Welcome to SimplyArticulate.</h1><p>Your checkout has returned successfully. Your account plan updates after Paddle's signed notification is verified. This page alone does not grant subscription access.</p><BillingPanel user={user} onSignUp={onSignUp}/><a href="/practice">Continue to practice →</a><a href="/subscription">Back to plans</a></main>;
}
