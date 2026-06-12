import { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import FeaturesCollage from '@/components/landing/FeaturesCollage';
import StorySection from '@/components/landing/StorySection';
import CraftsmanshipSection from '@/components/landing/CraftsmanshipSection';
import TeamSection from '@/components/landing/TeamSection';
import ProductsSection from '@/components/landing/ProductsSection';
import ShowcaseSection from '@/components/landing/ShowcaseSection';
import FaqSection from '@/components/landing/FaqSection';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'ConjuntOS - Gestión Residencial Inteligente',
  description: 'Plataforma de gestión residencial que transforma lo cotidiano en algo extraordinario. Inteligencia, comunidad y tecnología.',
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#05020a] text-white selection:bg-[#3b82f6]/30 selection:text-white overflow-hidden">
      <Navbar />
      <Hero />
      <FeaturesCollage />
      <StorySection />
      <CraftsmanshipSection />
      <TeamSection />
      <ProductsSection />
      <ShowcaseSection />
      <FaqSection />
      <Footer />
    </main>
  );
}
