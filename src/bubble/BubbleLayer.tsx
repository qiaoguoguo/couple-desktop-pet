interface BubbleLayerProps {
  message: string;
  visible: boolean;
}

export function BubbleLayer({ message, visible }: BubbleLayerProps) {
  if (!visible || message.length === 0) {
    return null;
  }

  return (
    <div className="bubble-layer" role="status" aria-live="polite">
      {message}
    </div>
  );
}
