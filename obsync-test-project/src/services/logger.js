function logInfo(message) {
  console.log(`[info] ${message}`);
}

function logWarn(message) {
  console.warn(`[warn] ${message}`);
}

module.exports = {
  logInfo,
  logWarn,
};
