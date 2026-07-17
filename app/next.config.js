/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

module.exports = nextConfig;
