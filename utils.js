class RetryUtils {
  static async withRetry(operation, options = {}) {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      shouldRetry = (error) => true
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt} failed:`, error);

        if (attempt === maxAttempts || !shouldRetry(error)) {
          throw lastError;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }
  }
}

class NetworkUtils {
  static isOnline() {
    return navigator.onLine;
  }

  static async waitForOnline() {
    if (this.isOnline()) {
      return true;
    }

    return new Promise(resolve => {
      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        resolve(true);
      };
      window.addEventListener('online', handleOnline);
    });
  }
}

class PerformanceUtils {
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}
