'use client';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLesson = pathname.startsWith('/lesson/');

  return (
    <>
      {!isLesson && <Navbar />}
      <main>{children}</main>
      {!isLesson && <Footer />}
    </>
  );
}
