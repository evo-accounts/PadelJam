'use client';
import { useParams } from 'next/navigation';
import { VenueForm } from '@/components/super-admin/VenueForm';

export default function EditVenuePage() {
  const { id } = useParams<{ id: string }>();
  return <VenueForm venueId={id} />;
}
