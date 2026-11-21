import React from 'react';

function HeroBanner() {
  return (
    <section className="relative w-full h-72 group overflow-hidden bg-gray-900 block">
      <img
        src="/photo1.jpg"
        alt="Banner"
        onError={(e) => {
          // Point to a direct valid image URL instead of a webpage link
          e.target.src = "https://picsum.photos/1600/600";
        }}
        className="w-full h-full object-cover block"
      />
      <div className="absolute bottom-0 left-0 w-full bg-black/70 text-center p-4 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
        <p className="text-white text-xl">
          Hey, I'm <span className="text-teal-400 font-semibold">N Kashitaa</span>
        </p>
      </div>
    </section>
  );
}

export default HeroBanner;