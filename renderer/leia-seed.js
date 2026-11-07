let stereoRandom=7331;const originalStereoRandom=Math.random;Math.random=()=>{stereoRandom=(Math.imul(stereoRandom,1664525)+1013904223)>>>0;return stereoRandom/4294967296;};
