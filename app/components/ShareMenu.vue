<script setup>
import { computed, ref } from 'vue';
import {
  AtSign,
  Briefcase,
  Camera,
  Check,
  Link2,
  Mail,
  MessageCircle,
  MessagesSquare,
  Send,
  Share2,
  ThumbsUp,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const props = defineProps({
  url: { type: String, required: true },
  title: { type: String, default: '' },
  class: { type: null, default: '' },
});

const copied = ref(false);
let copyTimer = null;

const encoded = computed(() => ({
  url: encodeURIComponent(props.url),
  text: encodeURIComponent(props.title || ''),
}));

const targets = computed(() => [
  {
    id: 'telegram',
    label: 'Telegram',
    icon: Send,
    href: `https://t.me/share/url?url=${encoded.value.url}&text=${encoded.value.text}`,
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    icon: AtSign,
    href: `https://twitter.com/intent/tweet?url=${encoded.value.url}&text=${encoded.value.text}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    href: `https://wa.me/?text=${encoded.value.text}%20${encoded.value.url}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Briefcase,
    href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded.value.url}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: ThumbsUp,
    href: `https://www.facebook.com/sharer/sharer.php?u=${encoded.value.url}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    icon: MessagesSquare,
    href: `https://www.reddit.com/submit?url=${encoded.value.url}&title=${encoded.value.text}`,
  },
  {
    id: 'email',
    label: 'Email',
    icon: Mail,
    href: `mailto:?subject=${encoded.value.text}&body=${encoded.value.url}`,
  },
]);

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.url);
  } catch {
    const field = document.createElement('textarea');
    field.value = props.url;
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 2000);
}

/**
 * Instagram has no web share endpoint: copy the link and open the app so the
 * reader can paste it into a story or bio.
 */
async function shareInstagram() {
  await copyLink();
  window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        :class="cn(props.class)"
        aria-label="Share this story"
      >
        <Share2 />
        <span class="hidden sm:inline">Share</span>
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-52">
      <DropdownMenuItem v-for="target in targets" :key="target.id">
        <a
          :href="target.href"
          target="_blank"
          rel="noopener noreferrer"
          class="flex w-full items-center gap-2 outline-none"
        >
          <component :is="target.icon" />
          {{ target.label }}
        </a>
      </DropdownMenuItem>

      <DropdownMenuItem @select="shareInstagram">
        <Camera />
        Instagram
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem @select="copyLink">
        <Check v-if="copied" />
        <Link2 v-else />
        {{ copied ? 'Link copied' : 'Copy link' }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
