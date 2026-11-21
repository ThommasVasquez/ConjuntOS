import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import StorySection from '@/components/landing/StorySection';
import CraftsmanshipSection from '@/components/landing/CraftsmanshipSection';
import TeamSection from '@/components/landing/TeamSection';
import ProductsSection from '@/components/landing/ProductsSection';
import BentoFeatures from '@/components/landing/BentoFeatures';
import ShowcaseSection from '@/components/landing/ShowcaseSection';
import FaqSection from '@/components/landing/FaqSection';
import Footer from '@/components/landing/Footer';
import SmoothScroll from '@/components/landing/SmoothScroll';
import CookieConsent from '@/components/landing/CookieConsent';
import CinematicLogoPortal from '@/components/landing/CinematicLogoPortal';

export default function LandingPage() {
  return (
    <>
      <CinematicLogoPortal />
      <SmoothScroll>
        <main className="min-h-screen bg-primary text-text selection:bg-text/20 selection:text-primary overflow-hidden">
          <Navbar />
          <Hero />
          <StorySection />
          <CraftsmanshipSection />
          <TeamSection />
          <ProductsSection />
          <BentoFeatures />
          <ShowcaseSection />
          <FaqSection />
          <Footer />
        </main>
      </SmoothScroll>
      <CookieConsent />
    </>
  );
}
