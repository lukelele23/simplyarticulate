import { useCallback, useEffect, useState } from "react";

function readStoredValue(storageKey, initialValue) {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    return storedValue === null ? initialValue : JSON.parse(storedValue);
  } catch (error) {
    console.error(`Failed to load local data for "${storageKey}":`, error);
    return initialValue;
  }
}

export default function usePersistentState(key, initialValue, userId) {
  const storageKey = `${key}:${userId ?? "signed-out"}`;
  const [storedState, setStoredState] = useState(() => ({
    storageKey,
    value: readStoredValue(storageKey, initialValue),
  }));

  useEffect(() => {
    if (storedState.storageKey !== storageKey) {
      setStoredState({
        storageKey,
        value: readStoredValue(storageKey, initialValue),
      });
    }
  }, [initialValue, storageKey, storedState.storageKey]);

  useEffect(() => {
    if (storedState.storageKey !== storageKey) return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(storedState.value));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('practice-storage-error', {detail:'This browser could not save your settings. Free some storage and try again.'}));
    }
  }, [storageKey, storedState]);

  const setValue = useCallback(
    (nextValue) => {
      setStoredState((currentState) => {
        const currentValue =
          currentState.storageKey === storageKey
            ? currentState.value
            : readStoredValue(storageKey, initialValue);
        return {
          storageKey,
          value:
            typeof nextValue === "function"
              ? nextValue(currentValue)
              : nextValue,
        };
      });
    },
    [initialValue, storageKey]
  );

  return [
    storedState.storageKey === storageKey ? storedState.value : initialValue,
    setValue,
  ];
}
